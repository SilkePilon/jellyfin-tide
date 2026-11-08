namespace Jellyfin.Plugin.Tide.Api;

/// <summary>Is the Intro Skipper plugin installed and active? (Its media segments drive Skip intro / credits.)</summary>
public static class IntroSkipperProbe
{
    public static readonly Guid Id = new("c83d86bb-a1e0-4c35-a113-e2101cf4ee6b");

    public static bool IsActive(IEnumerable<(Guid Id, string Name, bool Active)> plugins)
        => plugins.Any(p => p.Active && (p.Id == Id || string.Equals(p.Name, "Intro Skipper", StringComparison.OrdinalIgnoreCase)));
}
