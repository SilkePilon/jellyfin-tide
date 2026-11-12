using Jellyfin.Plugin.Tide.Models;

namespace Jellyfin.Plugin.Tide.Login;

/// <summary>A library item that could appear on the login poster wall.</summary>
public sealed record PosterCandidate(Guid Id, string? Tag, int? ParentalRating);

/// <summary>Which posters the public login page may show (spec: no adult titles, poster required, no metadata).</summary>
public static class LoginPosters
{
    /// <summary>Inherited parental rating value from which an item counts as adult-only.</summary>
    public const int AdultRating = 18;

    public static LoginPosterDto[] Pick(IEnumerable<PosterCandidate> candidates, int limit) =>
        candidates
            .Where(c => !string.IsNullOrEmpty(c.Tag) && (c.ParentalRating is null || c.ParentalRating < AdultRating))
            .DistinctBy(c => c.Id)
            .Take(limit)
            .Select(c => new LoginPosterDto(c.Id.ToString("N"), c.Tag!))
            .ToArray();
}
