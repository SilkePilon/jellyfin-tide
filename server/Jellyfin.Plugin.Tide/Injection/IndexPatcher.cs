using System.Text.RegularExpressions;

namespace Jellyfin.Plugin.Tide.Injection;

public static partial class IndexPatcher
{
    private const string Start = "<!-- tide:start -->";
    private const string End = "<!-- tide:end -->";

    public static string Patch(string html, string version)
    {
        var clean = Unpatch(html);
        var idx = clean.IndexOf("</head>", StringComparison.OrdinalIgnoreCase);
        if (idx < 0)
        {
            return clean;
        }

        var block = $"{Start}<link rel=\"stylesheet\" href=\"../Tide/client.css?v={version}\"><script defer src=\"../Tide/client.js?v={version}\"></script>{End}";
        return clean.Insert(idx, block);
    }

    public static string Unpatch(string html) => BlockRegex().Replace(html, string.Empty);

    [GeneratedRegex(@"<!-- tide:start -->.*?<!-- tide:end -->", RegexOptions.Singleline)]
    private static partial Regex BlockRegex();
}
