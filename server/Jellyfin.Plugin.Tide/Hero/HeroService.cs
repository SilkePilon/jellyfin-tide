using System.Text.RegularExpressions;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using Jellyfin.Plugin.Tide.Models;
using Jellyfin.Plugin.Tide.Quality;
using MediaBrowser.Controller.Drawing;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.Movies;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.TV;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Querying;

namespace Jellyfin.Plugin.Tide.Hero;

public sealed partial class HeroService
{
    private readonly ILibraryManager _library;
    private readonly IUserDataManager _userData;
    private readonly ITVSeriesManager _tv;
    private readonly QualityService _quality;
    private readonly IImageProcessor _images;

    public HeroService(ILibraryManager library, IUserDataManager userData, ITVSeriesManager tv, QualityService quality, IImageProcessor images)
    {
        _library = library;
        _userData = userData;
        _tv = tv;
        _quality = quality;
        _images = images;
    }

    /// <summary>
    /// Jellyfin's cache tags for the hero's images (the same tags the stock client uses). With a tag the image URL is
    /// served as cacheable for a year; it changes whenever the image does.
    /// </summary>
    private Dictionary<string, string> ImageTags(BaseItem item)
    {
        var tags = new Dictionary<string, string>();
        foreach (var (key, type) in new[] { ("Backdrop", ImageType.Backdrop), ("Logo", ImageType.Logo), ("Thumb", ImageType.Thumb) })
        {
            var info = item.GetImageInfo(type, 0);
            if (info is null)
            {
                continue;
            }

            try
            {
                var tag = _images.GetImageCacheTag(item, info);
                if (!string.IsNullOrEmpty(tag))
                {
                    tags[key] = tag;
                }
            }
            catch (Exception)
            {
                // No tag: the client falls back to the untagged URL.
            }
        }

        return tags;
    }

    public IReadOnlyList<HeroItemDto> Build(User user, int size, int newDays)
    {
        var newCutoff = DateTime.UtcNow.AddDays(-newDays);
        var personal = new List<HeroCandidate>();

        foreach (var item in Query(user, new[] { BaseItemKind.Movie, BaseItemKind.Episode }, ItemSortBy.DatePlayed, 40, null))
        {
            var ud = _userData.GetUserData(user, item);
            if (ud is { Played: false, PlaybackPositionTicks: > 0 })
            {
                personal.Add(Candidate(item, HeroReason.Resume));
            }
        }

        foreach (var ep in _tv.GetNextUp(new NextUpQuery { User = user, Limit = 10, EnableResumable = false }, new DtoOptions(false)).Items.OfType<Episode>())
        {
            personal.Add(Candidate(ep, ep.DateCreated >= newCutoff ? HeroReason.NewEpisode : HeroReason.NextEpisode));
        }

        var newest = Query(user, new[] { BaseItemKind.Movie, BaseItemKind.Series }, ItemSortBy.DateCreated, 30, null)
            .Where(i => !i.IsPlayed(user, _userData.GetUserData(user, i)))
            .Select(i => Candidate(i, HeroReason.New)).ToList();

        var topRated = Query(user, new[] { BaseItemKind.Movie, BaseItemKind.Series }, ItemSortBy.CommunityRating, 30, false)
            .Select(i => Candidate(i, HeroReason.TopRated)).ToList();

        return HeroSelector.Select(personal, newest, topRated, size)
            .Select(c => ToDto(c, user))
            .Where(d => d is not null)
            .Select(d => d!)
            .ToList();
    }

    private IReadOnlyList<BaseItem> Query(User user, BaseItemKind[] kinds, ItemSortBy sort, int limit, bool? isPlayed) =>
        _library.GetItemList(new InternalItemsQuery(user)
        {
            IncludeItemTypes = kinds,
            Recursive = true,
            IsPlayed = isPlayed,
            IsVirtualItem = false,
            Limit = limit,
            OrderBy = new[] { (sort, SortOrder.Descending) },
        });

    /// <summary>The "display" item for an episode is its series (backdrop, logo, key).</summary>
    private BaseItem Display(BaseItem item) => item is Episode ep && ep.Series is not null ? ep.Series : item;

    private HeroCandidate Candidate(BaseItem item, HeroReason reason)
    {
        var display = Display(item);
        return new HeroCandidate(display.Id.ToString("N"), item.Id, reason, display.HasImage(ImageType.Backdrop, 0), display.HasImage(ImageType.Logo, 0));
    }

    private HeroItemDto? ToDto(HeroCandidate c, User user)
    {
        var item = _library.GetItemById(c.ItemId);
        if (item is null)
        {
            return null;
        }

        var display = Display(item);
        Episode? episode = item as Episode;
        if (episode is null && display is Series s && c.Reason != HeroReason.TopRated && c.Reason != HeroReason.New)
        {
            episode = _quality.NextOrLatestEpisode(s, user);
        }

        var playable = (BaseItem?)episode ?? item;
        var ud = _userData.GetUserData(user, playable);
        var progress = Progress(ud?.PlaybackPositionTicks ?? 0, playable.RunTimeTicks);

        return new HeroItemDto
        {
            Id = display.Id.ToString("N"),
            Type = display is Series ? "Series" : "Movie",
            Reason = HeroSelector.ReasonString(c.Reason),
            Name = display.Name,
            Year = display.ProductionYear,
            Genres = display.Genres.Take(2).ToArray(),
            OfficialRating = display.OfficialRating,
            CommunityRating = display.CommunityRating,
            CriticRating = display.CriticRating,
            RuntimeMinutes = display is Movie && display.RunTimeTicks is { } t ? (int)(t / TimeSpan.TicksPerMinute) : null,
            SeasonCount = display is Series ser ? ser.GetSeasons(user, new DtoOptions(false)).Count : null,
            Overview = display.Overview ?? string.Empty,
            Episode = episode is null ? null : new EpisodeRef(episode.Id.ToString("N"), episode.ParentIndexNumber ?? 0, episode.IndexNumber ?? 0, episode.Name),
            Progress = progress,
            Quality = _quality.For(playable, user),
            HasLogo = display.HasImage(ImageType.Logo, 0),
            HasThumb = display.HasImage(ImageType.Thumb, 0),
            ImageTags = ImageTags(display),
            IsFavorite = _userData.GetUserData(user, display)?.IsFavorite ?? false,
            Youtube = display.RemoteTrailers.Select(t => YoutubeId(t.Url)).Where(id => id is not null).Select(id => id!).Take(3).ToArray(),
            PlayTargetId = playable.Id.ToString("N"),
        };
    }

    /// <summary>Resume progress, clamped: percent 0..100, minutes left never negative (stale runtime metadata).</summary>
    internal static ProgressDto? Progress(long positionTicks, long? runtimeTicks)
    {
        if (positionTicks <= 0 || runtimeTicks is not > 0)
        {
            return null;
        }

        var pct = (int)Math.Round(100.0 * positionTicks / runtimeTicks.Value);
        var left = (runtimeTicks.Value - positionTicks) / TimeSpan.TicksPerMinute;
        return new ProgressDto(Math.Clamp(pct, 0, 100), (int)Math.Max(0, left));
    }

    internal static string? YoutubeId(string? url)
    {
        if (string.IsNullOrEmpty(url))
        {
            return null;
        }

        var m = YoutubeRegex().Match(url);
        return m.Success ? m.Groups[1].Value : null;
    }

    [GeneratedRegex(@"(?:v=|youtu\.be/|embed/)([A-Za-z0-9_-]{11})")]
    private static partial Regex YoutubeRegex();
}
