using System.Text.Json;
using Jellyfin.Plugin.Tide.Api;
using Jellyfin.Plugin.Tide.Configuration;
using Xunit;

namespace Jellyfin.Plugin.Tide.Tests;

public class TideControllerTests
{
    [Theory]
    [InlineData(0, 1)]
    [InlineData(-5, 1)]
    [InlineData(14, 14)]
    [InlineData(365, 90)]
    public void NewDaysIsClamped(int configured, int expected) => Assert.Equal(expected, TideController.NewDays(configured));

    [Fact]
    public void ClientConfigExposesAdminDefaultsAsCamelCase()
    {
        var cfg = new PluginConfiguration
        {
            NewDays = 500,
            DefaultRowOrder = new[] { "topRated", "continue", "bogus" },
            DefaultHiddenRows = new[] { "random", "nope" },
        };
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(TideController.BuildClientConfig(cfg, "0.1.0")));
        var root = doc.RootElement;
        Assert.Equal(90, root.GetProperty("newDays").GetInt32());
        var order = root.GetProperty("defaultRowOrder").EnumerateArray().Select(e => e.GetString()).ToArray();
        Assert.Equal("topRated", order[0]);
        Assert.Equal(Array.IndexOf(order, "continue") + 1, Array.IndexOf(order, "nextUp"));
        Assert.Equal(15, order.Length);
        Assert.Equal(new[] { "random" }, root.GetProperty("defaultHiddenRows").EnumerateArray().Select(e => e.GetString()));
    }

    [Fact]
    public void ClientConfigExposesDetailsAndSmoothScroll()
    {
        using var on = JsonDocument.Parse(JsonSerializer.Serialize(TideController.BuildClientConfig(new PluginConfiguration(), "0.3.0")));
        Assert.True(on.RootElement.GetProperty("enableDetails").GetBoolean());
        Assert.True(on.RootElement.GetProperty("enableSmoothScroll").GetBoolean());
        var cfg = new PluginConfiguration { EnableDetails = false, EnableSmoothScroll = false };
        using var off = JsonDocument.Parse(JsonSerializer.Serialize(TideController.BuildClientConfig(cfg, "0.3.0")));
        Assert.False(off.RootElement.GetProperty("enableDetails").GetBoolean());
        Assert.False(off.RootElement.GetProperty("enableSmoothScroll").GetBoolean());
    }

    [Fact]
    public void ClientConfigExposesPlayerSettings()
    {
        using var d = JsonDocument.Parse(JsonSerializer.Serialize(TideController.BuildClientConfig(new PluginConfiguration(), "0.4.0", introSkipper: true)));
        Assert.True(d.RootElement.GetProperty("enablePlayer").GetBoolean());
        Assert.Equal(35, d.RootElement.GetProperty("creditsFallbackSeconds").GetInt32());
        Assert.True(d.RootElement.GetProperty("introSkipper").GetBoolean());
        using var c = JsonDocument.Parse(JsonSerializer.Serialize(TideController.BuildClientConfig(new PluginConfiguration { CreditsFallbackSeconds = 9999, EnablePlayer = false }, "0.4.0")));
        Assert.Equal(300, c.RootElement.GetProperty("creditsFallbackSeconds").GetInt32());
        Assert.False(c.RootElement.GetProperty("enablePlayer").GetBoolean());
        Assert.False(c.RootElement.GetProperty("introSkipper").GetBoolean());
    }

    [Theory]
    [InlineData("c83d86bb-a1e0-4c35-a113-e2101cf4ee6b", "Whatever", true, true)]
    [InlineData("00000000-0000-0000-0000-000000000001", "Intro Skipper", true, true)]
    [InlineData("00000000-0000-0000-0000-000000000001", "intro skipper", true, true)]
    [InlineData("c83d86bb-a1e0-4c35-a113-e2101cf4ee6b", "Intro Skipper", false, false)]
    [InlineData("00000000-0000-0000-0000-000000000001", "Tide", true, false)]
    public void IntroSkipperDetection(string id, string name, bool active, bool expected)
        => Assert.Equal(expected, IntroSkipperProbe.IsActive(new[] { (Guid.Parse(id), name, active) }));

    [Fact]
    public void ClientConfigCarriesEnableSearch()
    {
        using var on = JsonDocument.Parse(JsonSerializer.Serialize(TideController.BuildClientConfig(new PluginConfiguration(), "0.5.0")));
        Assert.True(on.RootElement.GetProperty("enableSearch").GetBoolean());
        using var off = JsonDocument.Parse(JsonSerializer.Serialize(TideController.BuildClientConfig(new PluginConfiguration { EnableSearch = false }, "0.5.0")));
        Assert.False(off.RootElement.GetProperty("enableSearch").GetBoolean());
    }
}
