using Jellyfin.Plugin.Tide.Hero;
using Jellyfin.Plugin.Tide.Injection;
using Jellyfin.Plugin.Tide.Prefs;
using Jellyfin.Plugin.Tide.Quality;
using MediaBrowser.Controller;
using MediaBrowser.Controller.Plugins;
using Microsoft.Extensions.DependencyInjection;

namespace Jellyfin.Plugin.Tide;

public sealed class PluginServiceRegistrator : IPluginServiceRegistrator
{
    public void RegisterServices(IServiceCollection services, IServerApplicationHost applicationHost)
    {
        services.AddHostedService<ScriptInjector>();
        services.AddSingleton(_ => new UserPrefsStore(Path.Combine(Plugin.Instance!.DataFolderPath, "prefs")));
        services.AddSingleton<QualityService>();
        services.AddSingleton<HeroService>();
        services.AddSingleton<Login.LoginService>();
    }
}
