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
        Assert.Equal(new[] { "topRated", "continue", "nextUp" }, order.Take(3));
        Assert.Equal(14, order.Length);
        Assert.Equal(new[] { "random" }, root.GetProperty("defaultHiddenRows").EnumerateArray().Select(e => e.GetString()));
    }
}
