using Jellyfin.Database.Implementations.Entities;
using Jellyfin.Plugin.Tide.Hero;
using Jellyfin.Plugin.Tide.Models;
using Jellyfin.Plugin.Tide.Prefs;
using Jellyfin.Plugin.Tide.Quality;
using MediaBrowser.Controller.Library;
using MediaBrowser.Controller.Net;
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

    public TideController(IAuthorizationContext auth, IUserManager users, HeroService hero, QualityService quality, UserPrefsStore prefs)
    {
        _auth = auth;
        _users = users;
        _hero = hero;
        _quality = quality;
        _prefs = prefs;
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

    private UserPrefs LoadPrefs(User user) => _prefs.Load(user.Id, Cfg.DefaultRowOrder, Cfg.DefaultHiddenRows);

    private static ClientConfig BuildClientConfig() => BuildClientConfig(Cfg, Plugin.Instance!.Version.ToString(3));

    internal static int NewDays(int configured) => Math.Clamp(configured, 1, 90);

    internal static ClientConfig BuildClientConfig(Configuration.PluginConfiguration cfg, string version)
    {
        // Same normalisation the prefs store applies, so "Reset to default" on the client matches a fresh user.
        var defaults = UserPrefsStore.Normalize(new UserPrefs { RowOrder = cfg.DefaultRowOrder, Hidden = cfg.DefaultHiddenRows });
        return new ClientConfig(
            cfg.EnableTheme, cfg.EnableIcons, cfg.EnableHome, cfg.EnableTrailers,
            Math.Clamp(cfg.HeroSlotSeconds, 8, 120), NewDays(cfg.NewDays), version,
            defaults.RowOrder, defaults.Hidden, cfg.EnableDetails, cfg.EnableSmoothScroll);
    }

    private async Task<User?> CurrentUser()
    {
        var info = await _auth.GetAuthorizationInfo(Request).ConfigureAwait(false);
        return info.UserId == Guid.Empty ? null : _users.GetUserById(info.UserId);
    }
}
