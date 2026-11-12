using Jellyfin.Plugin.Tide.Models;

namespace Jellyfin.Plugin.Tide.Api;

/// <summary>Whether the player may offer online subtitle search for an item (spec 0.5.0, section 1.3).</summary>
public static class SubtitleCapability
{
    public static SubtitleCapabilityDto Evaluate(bool isAdmin, bool canManage, IEnumerable<string?> providers)
    {
        var names = providers.Select(p => p?.Trim() ?? string.Empty).Where(p => p.Length > 0).Distinct().ToArray();
        return new SubtitleCapabilityDto((isAdmin || canManage) && names.Length > 0, names);
    }
}
