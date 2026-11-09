using System.Text.Json.Serialization;

namespace Jellyfin.Plugin.Tide.Models;

public static class RowIds
{
    public static readonly IReadOnlyList<string> All = new[]
    {
        "continue", "nextUp", "newThisWeek", "latestMovies", "topRated", "discover", "latestShows", "becauseYouWatched",
        "genre1", "genre2", "genre3", "favourites", "random", "collections", "musicAlbums", "musicArtists",
    };

    public static readonly IReadOnlySet<string> Genres = new HashSet<string> { "genre1", "genre2", "genre3" };
}

public sealed record QualityDto(
    [property: JsonPropertyName("res")] string Res,
    [property: JsonPropertyName("codec")] string Codec,
    [property: JsonPropertyName("range")] string? Range,
    [property: JsonPropertyName("audio")] string? Audio);

public sealed record EpisodeRef(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("season")] int Season,
    [property: JsonPropertyName("number")] int Number,
    [property: JsonPropertyName("name")] string Name);

public sealed record ProgressDto(
    [property: JsonPropertyName("percent")] int Percent,
    [property: JsonPropertyName("minutesLeft")] int MinutesLeft);

public sealed class HeroItemDto
{
    [JsonPropertyName("id")] public string Id { get; init; } = "";
    [JsonPropertyName("type")] public string Type { get; init; } = "Movie";
    [JsonPropertyName("reason")] public string Reason { get; init; } = "topRated";
    [JsonPropertyName("name")] public string Name { get; init; } = "";
    [JsonPropertyName("year")] public int? Year { get; init; }
    [JsonPropertyName("genres")] public string[] Genres { get; init; } = Array.Empty<string>();
    [JsonPropertyName("officialRating")] public string? OfficialRating { get; init; }
    [JsonPropertyName("communityRating")] public float? CommunityRating { get; init; }
    [JsonPropertyName("criticRating")] public float? CriticRating { get; init; }
    [JsonPropertyName("runtimeMinutes")] public int? RuntimeMinutes { get; init; }
    [JsonPropertyName("seasonCount")] public int? SeasonCount { get; init; }
    [JsonPropertyName("overview")] public string Overview { get; init; } = "";
    [JsonPropertyName("episode")] public EpisodeRef? Episode { get; init; }
    [JsonPropertyName("progress")] public ProgressDto? Progress { get; init; }
    [JsonPropertyName("quality")] public QualityDto? Quality { get; init; }
    [JsonPropertyName("hasLogo")] public bool HasLogo { get; init; }
    [JsonPropertyName("hasThumb")] public bool HasThumb { get; init; }
    /// <summary>0.4.2+: cache tags by image type ("Backdrop", "Logo", "Thumb"); missing types have no tag.</summary>
    [JsonPropertyName("imageTags")] public Dictionary<string, string> ImageTags { get; init; } = new();
    [JsonPropertyName("isFavorite")] public bool IsFavorite { get; init; }
    [JsonPropertyName("youtube")] public string[] Youtube { get; init; } = Array.Empty<string>();
    [JsonPropertyName("playTargetId")] public string PlayTargetId { get; init; } = "";
}

public sealed class UserPrefs
{
    [JsonPropertyName("rowOrder")] public string[] RowOrder { get; set; } = Array.Empty<string>();
    [JsonPropertyName("hidden")] public string[] Hidden { get; set; } = Array.Empty<string>();
    [JsonPropertyName("genres")] public Dictionary<string, string?> Genres { get; set; } = new();
    [JsonPropertyName("edited")] public bool Edited { get; set; }
}

public sealed record ClientConfig(
    [property: JsonPropertyName("enableTheme")] bool EnableTheme,
    [property: JsonPropertyName("enableIcons")] bool EnableIcons,
    [property: JsonPropertyName("enableHome")] bool EnableHome,
    [property: JsonPropertyName("enableTrailers")] bool EnableTrailers,
    [property: JsonPropertyName("heroSlotSeconds")] int HeroSlotSeconds,
    [property: JsonPropertyName("newDays")] int NewDays,
    [property: JsonPropertyName("version")] string Version,
    [property: JsonPropertyName("defaultRowOrder")] string[] DefaultRowOrder,
    [property: JsonPropertyName("defaultHiddenRows")] string[] DefaultHiddenRows,
    [property: JsonPropertyName("enableDetails")] bool EnableDetails,
    [property: JsonPropertyName("enableSmoothScroll")] bool EnableSmoothScroll,
    [property: JsonPropertyName("enablePlayer")] bool EnablePlayer,
    [property: JsonPropertyName("creditsFallbackSeconds")] int CreditsFallbackSeconds,
    [property: JsonPropertyName("introSkipper")] bool IntroSkipper);

public sealed record HomeResponse(
    [property: JsonPropertyName("hero")] IReadOnlyList<HeroItemDto> Hero,
    [property: JsonPropertyName("prefs")] UserPrefs Prefs,
    [property: JsonPropertyName("config")] ClientConfig Config);

public sealed class QualityRequest
{
    [JsonPropertyName("ids")] public string[]? Ids { get; set; } = Array.Empty<string>();
}
