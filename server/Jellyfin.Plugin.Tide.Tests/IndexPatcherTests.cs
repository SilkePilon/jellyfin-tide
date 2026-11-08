using Jellyfin.Plugin.Tide.Injection;
using Xunit;

namespace Jellyfin.Plugin.Tide.Tests;

public class IndexPatcherTests
{
    private const string Html = "<!doctype html><html><head><title>Jellyfin</title></head><body></body></html>";

    [Fact]
    public void InsertsBlockBeforeHeadClose()
    {
        var p = IndexPatcher.Patch(Html, "0.1.0");
        Assert.Contains("<!-- tide:start -->", p);
        Assert.Contains("src=\"../Tide/client.js?v=0.1.0\"", p);
        Assert.Contains("href=\"../Tide/client.css?v=0.1.0\"", p);
        Assert.True(p.IndexOf("tide:end", StringComparison.Ordinal) < p.IndexOf("</head>", StringComparison.Ordinal));
    }

    [Fact]
    public void IsIdempotentAndUpdatesVersion()
    {
        var once = IndexPatcher.Patch(Html, "0.1.0");
        var twice = IndexPatcher.Patch(once, "0.2.0");
        Assert.Equal(1, twice.Split("tide:start").Length - 1);
        Assert.Contains("v=0.2.0", twice);
        Assert.DoesNotContain("v=0.1.0", twice);
    }

    [Fact]
    public void UnpatchRestoresOriginal()
    {
        Assert.Equal(Html, IndexPatcher.Unpatch(IndexPatcher.Patch(Html, "0.1.0")));
    }

    [Fact]
    public void NoHeadLeavesHtmlUnchanged()
    {
        Assert.Equal("<html></html>", IndexPatcher.Patch("<html></html>", "0.1.0"));
    }

    [Fact]
    public void WriteAtomicReplacesFileAndLeavesNoTempFiles()
    {
        var dir = Directory.CreateTempSubdirectory("tide-idx").FullName;
        try
        {
            var index = Path.Combine(dir, "index.html");
            File.WriteAllText(index, Html);
            ScriptInjector.WriteAtomic(index, IndexPatcher.Patch(Html, "0.1.0"));
            Assert.Contains("tide:start", File.ReadAllText(index));
            ScriptInjector.WriteAtomic(index, IndexPatcher.Unpatch(File.ReadAllText(index)));
            Assert.Equal(Html, File.ReadAllText(index));
            Assert.Equal(new[] { "index.html" }, Directory.GetFiles(dir).Select(Path.GetFileName));
        }
        finally
        {
            Directory.Delete(dir, true);
        }
    }
}
