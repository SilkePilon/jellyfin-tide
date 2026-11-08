using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.Tide.Api;

[ApiController]
[Route("Tide")]
[AllowAnonymous]
public partial class AssetController : ControllerBase
{
    private static readonly Dictionary<string, string> Types = new(StringComparer.OrdinalIgnoreCase)
    {
        [".js"] = "application/javascript",
        [".css"] = "text/css",
        [".woff2"] = "font/woff2",
        [".woff"] = "font/woff",
        [".svg"] = "image/svg+xml",
        [".png"] = "image/png",
    };

    [HttpGet("client.js")]
    public IActionResult Js() => Serve("client.js");

    [HttpGet("client.css")]
    public IActionResult Css() => Serve("client.css");

    [HttpGet("assets/{**path}")]
    public IActionResult Asset(string path) => SafePath().IsMatch(path) ? Serve("assets/" + path) : NotFound();

    private IActionResult Serve(string relative)
    {
        var stream = typeof(AssetController).Assembly.GetManifestResourceStream("Tide.Web/" + relative);
        if (stream is null)
        {
            return NotFound();
        }

        Response.Headers.CacheControl = relative.StartsWith("assets/", StringComparison.Ordinal)
            ? "public, max-age=31536000, immutable"
            : "public, max-age=300";
        return File(stream, Types.GetValueOrDefault(Path.GetExtension(relative), "application/octet-stream"));
    }

    [GeneratedRegex(@"^[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$")]
    private static partial Regex SafePath();
}
