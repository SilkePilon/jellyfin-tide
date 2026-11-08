using Jellyfin.Plugin.Tide.Models;

namespace Jellyfin.Plugin.Tide.Quality;

public sealed record VideoStream(int? Width, string? Codec, string? RangeType);

public sealed record AudioStream(string? Profile, int? Channels, bool IsDefault);

public sealed record SourceStreams(IReadOnlyList<VideoStream> Video, IReadOnlyList<AudioStream> Audio);

public static class QualityMapper
{
    public static QualityDto? Map(IReadOnlyList<SourceStreams> sources)
    {
        var best = sources
            .Select(s => (Source: s, Video: s.Video.FirstOrDefault()))
            .Where(x => x.Video is not null)
            .OrderByDescending(x => x.Video!.Width ?? 0)
            .FirstOrDefault();
        if (best.Video is null)
        {
            return null;
        }

        var audio = best.Source.Audio.FirstOrDefault(a => a.IsDefault) ?? best.Source.Audio.FirstOrDefault();
        return new QualityDto(Res(best.Video.Width), Codec(best.Video.Codec), Range(best.Video.RangeType), Audio(audio));
    }

    internal static string Res(int? width) => width switch
    {
        >= 3800 => "4K",
        >= 1900 => "1080p",
        >= 1260 => "720p",
        _ => "SD",
    };

    internal static string Codec(string? codec) => (codec ?? string.Empty).ToLowerInvariant() switch
    {
        "hevc" or "h265" => "HEVC",
        "av1" => "AV1",
        "h264" or "avc" => "H.264",
        "vc1" => "VC-1",
        "mpeg2video" => "MPEG-2",
        var other => other.ToUpperInvariant(),
    };

    internal static string? Range(string? rangeType)
    {
        if (string.IsNullOrEmpty(rangeType))
        {
            return null;
        }

        if (rangeType.StartsWith("DOVI", StringComparison.OrdinalIgnoreCase))
        {
            return "DV";
        }

        return rangeType switch
        {
            "HDR10" => "HDR10",
            "HDR10Plus" => "HDR10+",
            "HLG" => "HLG",
            _ => null,
        };
    }

    internal static string? Audio(AudioStream? a)
    {
        if (a is null)
        {
            return null;
        }

        if (a.Profile?.Contains("Atmos", StringComparison.OrdinalIgnoreCase) == true)
        {
            return "Atmos";
        }

        return a.Channels switch
        {
            >= 8 => "7.1",
            7 => "6.1",
            6 => "5.1",
            2 => "Stereo",
            _ => null,
        };
    }
}
