using Jellyfin.Plugin.Tide.Configuration;
using Jellyfin.Plugin.Tide.Injection;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;
using Microsoft.Extensions.Logging.Abstractions;

namespace Jellyfin.Plugin.Tide;

public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    public static readonly Guid PluginId = Guid.Parse("7c1d3e5a-9b2f-4c6d-8e0a-1f3b5d7e9a2c");

    private readonly IApplicationPaths _paths;

    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
        _paths = applicationPaths;
    }

    public static Plugin? Instance { get; private set; }

    public override string Name => "Tide";

    public override Guid Id => PluginId;

    public override string Description => "Streaming-app theme and home screen for Jellyfin.";

    public IEnumerable<PluginPageInfo> GetPages() => new[]
    {
        new PluginPageInfo
        {
            Name = "Tide",
            EmbeddedResourcePath = GetType().Namespace + ".Configuration.configPage.html",
        },
    };

    public override void OnUninstalling()
    {
        ScriptInjector.Unpatch(_paths, NullLogger.Instance);
        base.OnUninstalling();
    }
}
