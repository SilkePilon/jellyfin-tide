using Jellyfin.Plugin.Tide.Hero;
using Xunit;

namespace Jellyfin.Plugin.Tide.Tests;

public class HeroSelectorTests
{
    private static HeroCandidate C(string key, HeroReason r, bool backdrop = true, bool logo = true) =>
        new(key, Guid.NewGuid(), r, backdrop, logo);

    private static List<HeroCandidate> Many(string prefix, HeroReason r, int n) =>
        Enumerable.Range(0, n).Select(i => C(prefix + i, r)).ToList();

    [Fact]
    public void TwoOfEachInterleaved()
    {
        var res = HeroSelector.Select(Many("p", HeroReason.Resume, 5), Many("n", HeroReason.New, 5), Many("t", HeroReason.TopRated, 5), 6);
        Assert.Equal(new[] { "p0", "n0", "t0", "p1", "n1", "t1" }, res.Select(x => x.Key));
    }

    [Fact]
    public void DeduplicatesAcrossPools()
    {
        var res = HeroSelector.Select(
            new[] { C("a", HeroReason.Resume), C("b", HeroReason.Resume) },
            new[] { C("a", HeroReason.New), C("c", HeroReason.New), C("d", HeroReason.New) },
            new[] { C("b", HeroReason.TopRated), C("e", HeroReason.TopRated), C("f", HeroReason.TopRated) },
            6);
        Assert.Equal(6, res.Count);
        Assert.Equal(res.Count, res.Select(x => x.Key).Distinct().Count());
    }

    [Fact]
    public void TopsUpWhenPoolShort()
    {
        var res = HeroSelector.Select(Array.Empty<HeroCandidate>(), Many("n", HeroReason.New, 5), Many("t", HeroReason.TopRated, 5), 6);
        Assert.Equal(6, res.Count);
        // quotas 2/2/2; personal is empty, so top-up runs personal -> newest -> topRated: newest fills first
        Assert.Equal(4, res.Count(x => x.Reason == HeroReason.New));
        Assert.Equal(2, res.Count(x => x.Reason == HeroReason.TopRated));
    }

    [Fact]
    public void SkipsCandidatesWithoutBackdrop()
    {
        var res = HeroSelector.Select(new[] { C("x", HeroReason.Resume, backdrop: false) }, Many("n", HeroReason.New, 1), Array.Empty<HeroCandidate>(), 6);
        Assert.Equal(new[] { "n0" }, res.Select(x => x.Key));
    }

    [Fact]
    public void TopRatedPrefersLogo()
    {
        var res = HeroSelector.Select(Array.Empty<HeroCandidate>(), Array.Empty<HeroCandidate>(),
            new[] { C("nologo", HeroReason.TopRated, logo: false), C("logo", HeroReason.TopRated) }, 1);
        Assert.Equal("logo", res.Single().Key);
    }

    [Fact]
    public void RespectsSize()
    {
        Assert.Equal(3, HeroSelector.Select(Many("p", HeroReason.Resume, 9), Many("n", HeroReason.New, 9), Many("t", HeroReason.TopRated, 9), 3).Count);
    }

    [Theory]
    [InlineData(HeroReason.Resume, "resume")]
    [InlineData(HeroReason.NextEpisode, "nextEpisode")]
    [InlineData(HeroReason.NewEpisode, "newEpisode")]
    [InlineData(HeroReason.New, "new")]
    [InlineData(HeroReason.TopRated, "topRated")]
    public void ReasonStrings(HeroReason r, string s) => Assert.Equal(s, HeroSelector.ReasonString(r));
}
