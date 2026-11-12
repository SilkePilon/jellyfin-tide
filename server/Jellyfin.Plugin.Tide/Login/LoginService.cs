using Jellyfin.Data.Enums;
using Jellyfin.Database.Implementations.Enums;
using Jellyfin.Plugin.Tide.Models;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Drawing;
using MediaBrowser.Controller.Entities;
using MediaBrowser.Controller.Library;
using MediaBrowser.Model.Entities;

namespace Jellyfin.Plugin.Tide.Login;

/// <summary>Data for the anonymous login page: server name and a cached random set of posters.</summary>
public sealed class LoginService
{
    public const int PosterCount = 40;
    public static readonly TimeSpan CacheFor = TimeSpan.FromMinutes(30);

    private readonly ILibraryManager _library;
    private readonly IImageProcessor _images;
    private readonly IServerApplicationHost _host;
    private readonly object _lock = new();
    private (DateTime At, LoginPosterDto[] Posters)? _cache;

    public LoginService(ILibraryManager library, IImageProcessor images, IServerApplicationHost host)
    {
        _library = library;
        _images = images;
        _host = host;
    }

    public LoginConfigDto Build(bool enabled) =>
        enabled ? new LoginConfigDto(true, _host.FriendlyName, Posters()) : LoginConfigDto.Disabled;

    private LoginPosterDto[] Posters()
    {
        lock (_lock)
        {
            if (_cache is { } c && DateTime.UtcNow - c.At < CacheFor)
            {
                return c.Posters;
            }

            var items = _library.GetItemList(new InternalItemsQuery
            {
                IncludeItemTypes = new[] { BaseItemKind.Movie, BaseItemKind.Series },
                Recursive = true,
                IsVirtualItem = false,
                ImageTypes = new[] { ImageType.Primary },
                OrderBy = new[] { (ItemSortBy.Random, SortOrder.Ascending) },
                Limit = PosterCount * 2,
            });
            var posters = LoginPosters.Pick(items.Select(i => new PosterCandidate(i.Id, Tag(i), i.InheritedParentalRatingValue)), PosterCount);
            _cache = (DateTime.UtcNow, posters);
            return posters;
        }
    }

    private string? Tag(BaseItem item)
    {
        var info = item.GetImageInfo(ImageType.Primary, 0);
        if (info is null)
        {
            return null;
        }

        try
        {
            return _images.GetImageCacheTag(item, info);
        }
        catch (Exception)
        {
            return null;
        }
    }
}
