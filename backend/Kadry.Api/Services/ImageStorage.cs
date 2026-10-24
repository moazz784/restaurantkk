using Amazon;
using Amazon.S3;
using Amazon.S3.Model;

namespace Kadry.Api.Services;

public interface IImageStorage
{
    Task<string> SaveAsync(IFormFile file, CancellationToken cancellationToken);
}

public sealed class ImageStorage(IConfiguration configuration, IWebHostEnvironment environment) : IImageStorage
{
    private const long MaximumFileBytes = 5 * 1024 * 1024;
    private static readonly Dictionary<string, (string ContentType, string Extension)> SupportedTypes = new()
    {
        ["image/jpeg"] = ("image/jpeg", ".jpg"),
        ["image/png"] = ("image/png", ".png"),
        ["image/webp"] = ("image/webp", ".webp")
    };

    public async Task<string> SaveAsync(IFormFile file, CancellationToken cancellationToken)
    {
        if (file.Length is <= 0 or > MaximumFileBytes)
            throw new InvalidDataException("حجم الصورة يجب أن يكون أقل من ٥ ميجابايت.");

        var header = new byte[12];
        await using (var stream = file.OpenReadStream())
            await stream.ReadExactlyAsync(header.AsMemory(0, (int)Math.Min(file.Length, header.Length)), cancellationToken);

        var contentType = DetectContentType(header);
        if (contentType is null || !SupportedTypes.TryGetValue(contentType, out var type))
            throw new InvalidDataException("نوع الصورة غير مدعوم. ارفع JPG أو PNG أو WebP فقط.");

        var objectName = $"{Guid.NewGuid():N}{type.Extension}";
        if (string.Equals(configuration["Storage:Provider"], "S3", StringComparison.OrdinalIgnoreCase))
            return await SaveToS3Async(file, objectName, type.ContentType, cancellationToken);

        if (environment.IsProduction())
            throw new InvalidOperationException("إعداد تخزين الصور السحابي مطلوب في بيئة الإنتاج.");

        var uploadDirectory = Path.Combine(environment.WebRootPath ?? Path.Combine(environment.ContentRootPath, "wwwroot"), "uploads");
        Directory.CreateDirectory(uploadDirectory);
        var fullPath = Path.Combine(uploadDirectory, objectName);
        await using (var output = File.Create(fullPath))
            await file.CopyToAsync(output, cancellationToken);
        return $"/uploads/{objectName}";
    }

    private async Task<string> SaveToS3Async(IFormFile file, string key, string contentType, CancellationToken cancellationToken)
    {
        var bucket = configuration["Storage:S3:Bucket"];
        var publicBaseUrl = configuration["Storage:S3:PublicBaseUrl"]?.TrimEnd('/');
        if (string.IsNullOrWhiteSpace(bucket) || string.IsNullOrWhiteSpace(publicBaseUrl))
            throw new InvalidOperationException("أكمل إعدادات Storage:S3:Bucket و Storage:S3:PublicBaseUrl.");

        var regionName = configuration["Storage:S3:Region"] ?? "eu-central-1";
        var endpoint = configuration["Storage:S3:ServiceUrl"];
        var config = new AmazonS3Config { RegionEndpoint = RegionEndpoint.GetBySystemName(regionName) };
        if (!string.IsNullOrWhiteSpace(endpoint))
        {
            config.ServiceURL = endpoint;
            config.ForcePathStyle = true;
        }
        using var client = new AmazonS3Client(config);
        await using var input = file.OpenReadStream();
        await client.PutObjectAsync(new PutObjectRequest
        {
            BucketName = bucket,
            Key = key,
            InputStream = input,
            ContentType = contentType
        }, cancellationToken);
        return $"{publicBaseUrl}/{Uri.EscapeDataString(key)}";
    }

    private static string? DetectContentType(ReadOnlySpan<byte> bytes)
    {
        if (bytes.Length >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff) return "image/jpeg";
        if (bytes.Length >= 8 && bytes[..8].SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 })) return "image/png";
        if (bytes.Length >= 12 && bytes[..4].SequenceEqual("RIFF"u8) && bytes[8..12].SequenceEqual("WEBP"u8)) return "image/webp";
        return null;
    }
}
