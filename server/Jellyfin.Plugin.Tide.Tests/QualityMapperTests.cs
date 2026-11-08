using Jellyfin.Plugin.Tide.Quality;
using Xunit;

namespace Jellyfin.Plugin.Tide.Tests;

public class QualityMapperTests
{
    private static SourceStreams S(int? w, string codec, string range, string? profile = null, int? ch = 6, bool def = true) =>
        new(new[] { new VideoStream(w, codec, range) }, new[] { new AudioStream(profile, ch, def) });

    [Theory]
    [InlineData(3840, "4K")]
    [InlineData(3832, "4K")]
    [InlineData(1920, "1080p")]
    [InlineData(1280, "720p")]
    [InlineData(720, "SD")]
    public void Resolution(int width, string expected) =>
        Assert.Equal(expected, QualityMapper.Map(new[] { S(width, "hevc", "SDR") })!.Res);

    [Theory]
    [InlineData("hevc", "HEVC")]
    [InlineData("av1", "AV1")]
    [InlineData("h264", "H.264")]
    [InlineData("vc1", "VC-1")]
    [InlineData("mpeg2video", "MPEG-2")]
    [InlineData("vp9", "VP9")]
    public void Codec(string codec, string expected) =>
        Assert.Equal(expected, QualityMapper.Map(new[] { S(1920, codec, "SDR") })!.Codec);

    [Theory]
    [InlineData("SDR", null)]
    [InlineData("HDR10", "HDR10")]
    [InlineData("HDR10Plus", "HDR10+")]
    [InlineData("HLG", "HLG")]
    [InlineData("DOVI", "DV")]
    [InlineData("DOVIWithHDR10", "DV")]
    [InlineData("DOVIWithHDR10Plus", "DV")]
    [InlineData("DOVIInvalid", "DV")]
    [InlineData("Unknown", null)]
    public void Range(string rangeType, string? expected) =>
        Assert.Equal(expected, QualityMapper.Map(new[] { S(3840, "hevc", rangeType) })!.Range);

    [Theory]
    [InlineData("Dolby TrueHD + Dolby Atmos", 8, "Atmos")]
    [InlineData("Dolby Digital Plus + Dolby Atmos", 6, "Atmos")]
    [InlineData("LC", 8, "7.1")]
    [InlineData("LC", 7, "6.1")]
    [InlineData("LC", 6, "5.1")]
    [InlineData("LC", 5, null)]
    [InlineData("LC", 4, null)]
    [InlineData("LC", 3, null)]
    [InlineData(null, 2, "Stereo")]
    [InlineData(null, 1, null)]
    public void Audio(string? profile, int ch, string? expected) =>
        Assert.Equal(expected, QualityMapper.Map(new[] { S(1920, "h264", "SDR", profile, ch) })!.Audio);

    [Fact]
    public void PrefersDefaultAudioStream()
    {
        var src = new SourceStreams(
            new[] { new VideoStream(1920, "h264", "SDR") },
            new[] { new AudioStream(null, 2, false), new AudioStream("Dolby Atmos", 8, true) });
        Assert.Equal("Atmos", QualityMapper.Map(new[] { src })!.Audio);
    }

    [Fact]
    public void PicksHighestResolutionSource()
    {
        var q = QualityMapper.Map(new[] { S(1920, "h264", "SDR"), S(3840, "hevc", "HDR10") })!;
        Assert.Equal("4K", q.Res);
        Assert.Equal("HEVC", q.Codec);
    }

    [Fact]
    public void NoVideoReturnsNull() =>
        Assert.Null(QualityMapper.Map(new[] { new SourceStreams(Array.Empty<VideoStream>(), Array.Empty<AudioStream>()) }));
}
