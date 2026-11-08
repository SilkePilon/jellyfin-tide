using Jellyfin.Plugin.Tide.Configuration;
using Xunit;

namespace Jellyfin.Plugin.Tide.Tests;

public class SmokeTests
{
    [Fact]
    public void DefaultConfigHasAllRows()
    {
        var c = new PluginConfiguration();
        Assert.Equal(16, c.DefaultRowOrder.Length);
        Assert.Equal(6, c.HeroSize);
    }
}
