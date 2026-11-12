using Jellyfin.Plugin.Tide.Login;
using Jellyfin.Plugin.Tide.Models;
using Xunit;

namespace Jellyfin.Plugin.Tide.Tests;

public class LoginPostersTests
{
    private static PosterCandidate C(int n, string? tag = "t", int? rating = null) =>
        new(new Guid($"00000000-0000-0000-0000-{n:D12}"), tag, rating);

    [Fact]
    public void SkipsAdultRatingsAndItemsWithoutAPoster()
    {
        var r = LoginPosters.Pick(new[] { C(1), C(2, rating: 18), C(3, tag: null), C(4, rating: 17), C(5, rating: 21), C(6, tag: "") }, 10);
        Assert.Equal(new[] { C(1).Id.ToString("N"), C(4).Id.ToString("N") }, r.Select(p => p.Id));
        Assert.All(r, p => Assert.Equal("t", p.Tag));
    }

    [Fact]
    public void RespectsTheLimitAndDropsDuplicates()
    {
        var r = LoginPosters.Pick(new[] { C(1), C(1), C(2), C(3), C(4) }, 3);
        Assert.Equal(new[] { C(1).Id.ToString("N"), C(2).Id.ToString("N"), C(3).Id.ToString("N") }, r.Select(p => p.Id));
    }

    [Fact]
    public void DisabledConfigCarriesNothing()
    {
        var d = LoginConfigDto.Disabled;
        Assert.False(d.Enabled);
        Assert.Null(d.ServerName);
        Assert.Empty(d.Posters);
    }
}
