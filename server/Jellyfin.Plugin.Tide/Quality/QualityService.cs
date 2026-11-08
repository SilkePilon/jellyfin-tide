using System.Collections.Concurrent;
using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using Jellyfin.Plugin.Tide.Models;
using MediaBrowser.Controller.Dto;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Entities.TV;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.TV;
using MediaBrowser.Model.Entities;
using MediaBrowser.Model.Querying;

namespace Jellyfin.Plugin.Tide.Quality;

public sealed class QualityService
{
    private readonly ILibraryManager _library;
    private readonly ITVSeriesManager _tv;
    private readonly ConcurrentDictionary<Guid, QualityDto?> _cache = new();

    public QualityService(ILibraryManager library, ITVSeriesManager tv)
    {
        _library = library;
        _tv = tv;
        _library.ItemUpdated += (_, e) => Invalidate(e.Item);
        _library.ItemRemoved += (_, e) => Invalidate(e.Item);
        _library.ItemAdded += (_, e) =>
        {
            // A new episode may become the series' latest one.
            if (e.Item is Episode ep)
            {
                _cache.TryRemove(ep.SeriesId, out QualityDto? _);
            }
        };
    }

    private void Invalidate(BaseItem item)
    {
        _cache.TryRemove(item.Id, out QualityDto? _);
        if (item is Episode ep)
        {
            _cache.TryRemove(ep.SeriesId, out QualityDto? _);
        }
    }

    /// <summary>
    /// Quality of a movie/episode, or of a series' latest episode. Both are user-independent, so both are cached
    /// (series under the series id). The hero still resolves the user's next-up episode separately for playback.
    /// </summary>
    public QualityDto? For(BaseItem item, User user)
    {
        if (item is Series series)
        {
            return _cache.GetOrAdd(series.Id, _ => LatestEpisode(series) is { } ep ? QualityMapper.Map(Streams(ep)) : null);
        }

        return _cache.GetOrAdd(item.Id, _ => QualityMapper.Map(Streams(item)));
    }

    public Dictionary<string, QualityDto?> ForIds(IEnumerable<string> ids, User user)
    {
        var result = new Dictionary<string, QualityDto?>();
        foreach (var raw in ids.Take(100))
        {
            if (Guid.TryParse(raw, out var id) && _library.GetItemById(id) is { } item && item.IsVisible(user))
            {
                result[raw] = For(item, user);
            }
        }

        return result;
    }

    /// <summary>One targeted query: the series' last real episode (highest season, then episode number).</summary>
    private Episode? LatestEpisode(Series series) =>
        _library.GetItemList(new InternalItemsQuery
        {
            AncestorIds = new[] { series.Id },
            IncludeItemTypes = new[] { BaseItemKind.Episode },
            Recursive = true,
            IsVirtualItem = false,
            Limit = 1,
            OrderBy = new[] { (ItemSortBy.ParentIndexNumber, SortOrder.Descending), (ItemSortBy.IndexNumber, SortOrder.Descending) },
            DtoOptions = new DtoOptions(false),
        }).OfType<Episode>().FirstOrDefault();

    public Episode? NextOrLatestEpisode(Series series, User user)
    {
        var next = _tv.GetNextUp(new NextUpQuery { User = user, SeriesId = series.Id, Limit = 1 }, new DtoOptions(false)).Items.FirstOrDefault();
        return next as Episode ?? series.GetEpisodes(user, new DtoOptions(false), false).OfType<Episode>().LastOrDefault();
    }

    private static IReadOnlyList<SourceStreams> Streams(BaseItem item) =>
        item.GetMediaSources(false).Select(s => new SourceStreams(
            s.MediaStreams.Where(m => m.Type == MediaStreamType.Video)
                .Select(m => new VideoStream(m.Width, m.Codec, m.VideoRangeType.ToString())).ToList(),
            s.MediaStreams.Where(m => m.Type == MediaStreamType.Audio)
                .Select(m => new AudioStream(m.Profile, m.Channels, m.IsDefault)).ToList())).ToList();
}
