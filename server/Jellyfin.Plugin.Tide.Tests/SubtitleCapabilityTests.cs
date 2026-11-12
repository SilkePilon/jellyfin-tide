using Jellyfin.Plugin.Tide.Api;
using Xunit;

namespace Jellyfin.Plugin.Tide.Tests;

public class SubtitleCapabilityTests
{
    [Fact]
    public void AdminWithProviderCanSearch()
    {
        var c = SubtitleCapability.Evaluate(isAdmin: true, canManage: false, new[] { "Open Subtitles" });
        Assert.True(c.CanSearch);
        Assert.Equal(new[] { "Open Subtitles" }, c.Providers);
    }

    [Fact]
    public void PermittedUserCanSearch() => Assert.True(SubtitleCapability.Evaluate(false, true, new[] { "Open Subtitles" }).CanSearch);

    [Fact]
    public void UserWithoutPermissionCannot() => Assert.False(SubtitleCapability.Evaluate(false, false, new[] { "Open Subtitles" }).CanSearch);

    [Fact]
    public void NoProviderMeansNoSearchEvenForAdmins()
    {
        var c = SubtitleCapability.Evaluate(true, true, Array.Empty<string>());
        Assert.False(c.CanSearch);
        Assert.Empty(c.Providers);
    }

    [Fact]
    public void ProviderNamesAreTrimmedAndDistinct() =>
        Assert.Equal(new[] { "A", "B" }, SubtitleCapability.Evaluate(true, false, new[] { "A", " ", "B", "A" }).Providers);
}
