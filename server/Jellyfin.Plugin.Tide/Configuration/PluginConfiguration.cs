using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.Tide.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    public bool EnableTheme { get; set; } = true;
    public bool EnableIcons { get; set; } = true;
    public bool EnableHome { get; set; } = true;
    public bool EnableTrailers { get; set; } = true;
    public int HeroSize { get; set; } = 6;
    public int HeroSlotSeconds { get; set; } = 30;
    public int NewDays { get; set; } = 14;
    public string[] DefaultRowOrder { get; set; } = Models.RowIds.All.ToArray();
    public string[] DefaultHiddenRows { get; set; } = Array.Empty<string>();
}
