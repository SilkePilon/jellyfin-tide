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
        Assert.Equal(16, order.Length);
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
}
