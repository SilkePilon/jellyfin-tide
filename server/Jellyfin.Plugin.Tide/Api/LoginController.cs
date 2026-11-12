using Jellyfin.Plugin.Tide.Login;
using Jellyfin.Plugin.Tide.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Tide.Api;

/// <summary>Anonymous: the login page runs before anyone is signed in.</summary>
[ApiController]
[Route("Tide")]
[AllowAnonymous]
public class LoginController : ControllerBase
{
    private readonly LoginService _login;

    public LoginController(LoginService login)
    {
        _login = login;
    }

    [HttpGet("Login")]
    public ActionResult<LoginConfigDto> GetLogin() => _login.Build(Plugin.Instance!.Configuration.EnableLogin);
}
