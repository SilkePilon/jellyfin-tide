using Jellyfin.Data;
using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Database.Implementations.Enums;
using Jellyfin.Plugin.Tide.Hero;
using Jellyfin.Plugin.Tide.Models;
using Jellyfin.Plugin.Tide.Prefs;
using Jellyfin.Plugin.Tide.Quality;
using MediaBrowser.Controller.Library;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Controller.Net;
using MediaBrowser.Controller.Subtitles;
using MediaBrowser.Model.Plugins;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;

namespace Jellyfin.Plugin.Tide.Api;

[ApiController]
[Route("Tide")]
[Authorize]
public class TideController : ControllerBase
{
    private readonly IAuthorizationContext _auth;
    private readonly IUserManager _users;
    private readonly HeroService _hero;
    private readonly QualityService _quality;
    private readonly UserPrefsStore _prefs;
    private readonly IPluginManager _plugins;
    private readonly ILibraryManager _library;
    private readonly ISubtitleManager _subtitles;

    public TideController(IAuthorizationContext auth, IUserManager users, HeroService hero, QualityService quality, UserPrefsStore prefs, IPluginManager plugins, ILibraryManager library, ISubtitleManager subtitles)
    {
        _auth = auth;
        _users = users;
        _hero = hero;
        _quality = quality;
        _prefs = prefs;
        _plugins = plugins;
        _library = library;
        _subtitles = subtitles;
    }

    private static Configuration.PluginConfiguration Cfg => Plugin.Instance!.Configuration;

    [HttpGet("ClientConfig")]
    public ActionResult<ClientConfig> GetClientConfig() => BuildClientConfig();

    [HttpGet("Home")]
    public async Task<ActionResult<HomeResponse>> GetHome()
    {
        var user = await CurrentUser();
        if (user is null)
        {
            return Unauthorized();
        }

        var hero = _hero.Build(user, Math.Clamp(Cfg.HeroSize, 1, 12), NewDays(Cfg.NewDays));
        return new HomeResponse(hero, LoadPrefs(user), BuildClientConfig());
    }

    [HttpPost("Quality")]
    public async Task<ActionResult<Dictionary<string, QualityDto?>>> PostQuality([FromBody(EmptyBodyBehavior = EmptyBodyBehavior.Allow)] QualityRequest? req)
    {
        var user = await CurrentUser();
        return user is null ? Unauthorized() : _quality.ForIds(req?.Ids ?? [], user);
    }

    [HttpGet("UserPrefs")]
    public async Task<ActionResult<UserPrefs>> GetPrefs()
    {
        var user = await CurrentUser();
        return user is null ? Unauthorized() : LoadPrefs(user);
    }

    [HttpPut("UserPrefs")]
    public async Task<ActionResult<UserPrefs>> PutPrefs([FromBody] UserPrefs prefs)
    {
        var user = await CurrentUser();
        if (user is null)
        {
            return Unauthorized();
        }

        _prefs.Save(user.Id, prefs);
        return LoadPrefs(user);
    }

    [HttpGet("Subtitles/Capability")]
    public async Task<ActionResult<SubtitleCapabilityDto>> GetSubtitleCapability([FromQuery] Guid itemId)
    {
        var user = await CurrentUser();
        if (user is null)
        {
            return Unauthorized();
        }

        var item = _library.GetItemById(itemId);
        if (item is null)
        {
            return NotFound();
        }

        var providers = _subtitles.GetSupportedProviders(item).Select(p => p.Name);
        return SubtitleCapability.Evaluate(
            user.HasPermission(PermissionKind.IsAdministrator),
            user.HasPermission(PermissionKind.EnableSubtitleManagement),
            providers);
    }

    private UserPrefs LoadPrefs(User user) => _prefs.Load(user.Id, Cfg.DefaultRowOrder, Cfg.DefaultHiddenRows);

    private ClientConfig BuildClientConfig()
    {
        var intro = IntroSkipperProbe.IsActive(_plugins.Plugins.Select(p => (p.Id, p.Name, p.Manifest.Status == PluginStatus.Active)));
        return BuildClientConfig(Cfg, Plugin.Instance!.Version.ToString(3), intro);
    }

    internal static ClientConfig BuildClientConfig(Configuration.PluginConfiguration cfg, string version, bool introSkipper = false)
    {
        var defaults = UserPrefsStore.Normalize(new UserPrefs { RowOrder = cfg.DefaultRowOrder, Hidden = cfg.DefaultHiddenRows });
        return new ClientConfig(
            cfg.EnableTheme, cfg.EnableIcons, cfg.EnableHome, cfg.EnableTrailers,
            Math.Clamp(cfg.HeroSlotSeconds, 8, 120), NewDays(cfg.NewDays), version,
            defaults.RowOrder, defaults.Hidden, cfg.EnableDetails, cfg.EnableSmoothScroll,
            cfg.EnablePlayer, Math.Clamp(cfg.CreditsFallbackSeconds, 0, 300), introSkipper, cfg.EnableSearch, cfg.EnableLogin);
    }

    internal static int NewDays(int configured) => Math.Clamp(configured, 1, 90);

    private async Task<User?> CurrentUser()
    {
        var info = await _auth.GetAuthorizationInfo(Request).ConfigureAwait(false);
        return info.UserId == Guid.Empty ? null : _users.GetUserById(info.UserId);
    }
}
