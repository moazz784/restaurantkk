using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Kadry.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace Kadry.Api.Services;

public sealed class PaymobService(
    IConfiguration configuration,
    IHttpClientFactory httpClientFactory,
    AppDbContext dbContext,
    ILogger<PaymobService> logger)
{
    public async Task<string> CreateCheckoutAsync(CustomerOrder order, CancellationToken cancellationToken)
    {
        var secret = configuration["Paymob:SecretKey"];
        var publicKey = configuration["Paymob:PublicKey"];
        var methods = configuration.GetSection("Paymob:PaymentMethodIds").Get<int[]>() ?? [];
        var webhookSecret = configuration["Paymob:HmacSecret"];
        var notificationUrl = configuration["Paymob:NotificationUrl"];
        var redirectionUrl = configuration["Paymob:RedirectionUrl"];
        if (string.IsNullOrWhiteSpace(secret) || string.IsNullOrWhiteSpace(publicKey) ||
            string.IsNullOrWhiteSpace(webhookSecret) || methods.Length == 0 ||
            !IsHttpsUrl(notificationUrl) || !IsHttpsUrl(redirectionUrl))
            throw new InvalidOperationException("الدفع بالبطاقة غير مُعد بعد. أكمل بيانات Paymob وروابط HTTPS في إعدادات الخادم، أو اختر الدفع كاش.");

        var client = httpClientFactory.CreateClient("Paymob");
        var payload = new
        {
            amount = checked((long)Math.Round(order.Total * 100, MidpointRounding.AwayFromZero)),
            currency = "EGP",
            payment_methods = methods,
            special_reference = order.OrderNumber,
            notification_url = notificationUrl,
            redirection_url = new Uri(
                new Uri(redirectionUrl!.TrimEnd('/') + "/"),
                $"order-confirmation/{Uri.EscapeDataString(order.OrderNumber)}").ToString(),
            items = order.Items.Select(item => new
            {
                name = item.ProductName,
                amount = checked((long)Math.Round(item.UnitPrice * 100, MidpointRounding.AwayFromZero)),
                description = item.ProductName,
                quantity = item.Quantity
            }),
            billing_data = new
            {
                first_name = order.CustomerName.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "Customer",
                last_name = string.Join(' ', order.CustomerName.Split(' ', StringSplitOptions.RemoveEmptyEntries).Skip(1)),
                phone_number = order.Phone,
                email = "NA",
                street = order.Address,
                building = "NA",
                floor = "NA",
                apartment = "NA",
                city = "Cairo",
                country = "EG",
                state = "Cairo"
            }
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, "v1/intention/")
        {
            Content = JsonContent.Create(payload)
        };
        request.Headers.Add("Authorization", $"Token {secret}");
        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            logger.LogError("Paymob checkout creation failed with status {StatusCode}", (int)response.StatusCode);
            throw new InvalidOperationException("تعذر إنشاء جلسة الدفع الآن. لم يتم تحصيل أي مبلغ؛ حاول لاحقًا أو اختر الدفع كاش.");
        }
        using var json = await JsonDocument.ParseAsync(await response.Content.ReadAsStreamAsync(cancellationToken), cancellationToken: cancellationToken);
        if (!json.RootElement.TryGetProperty("client_secret", out var clientSecretElement))
            throw new InvalidOperationException("لم تُرجع بوابة الدفع رابطًا صالحًا. لم يتم تحصيل أي مبلغ.");
        var clientSecret = clientSecretElement.GetString();
        if (string.IsNullOrWhiteSpace(clientSecret))
            throw new InvalidOperationException("لم تُرجع بوابة الدفع رابطًا صالحًا. لم يتم تحصيل أي مبلغ.");

        return $"https://accept.paymob.com/unifiedcheckout/?publicKey={Uri.EscapeDataString(publicKey)}&clientSecret={Uri.EscapeDataString(clientSecret)}";
    }

    public async Task<bool> ProcessWebhookAsync(JsonElement payload, string? hmac, CancellationToken cancellationToken)
    {
        var hmacSecret = configuration["Paymob:HmacSecret"];
        if (string.IsNullOrWhiteSpace(hmacSecret) || string.IsNullOrWhiteSpace(hmac))
            return false;

        var transaction = payload.TryGetProperty("obj", out var obj) ? obj : payload;
        if (!ValidateHmac(transaction, hmac, hmacSecret))
            return false;

        var reference = GetString(transaction, "special_reference");
        var transactionId = GetString(transaction, "id");
        if (string.IsNullOrWhiteSpace(reference) || string.IsNullOrWhiteSpace(transactionId))
            return false;

        var order = await dbContext.Orders.Include(item => item.Payments)
            .SingleOrDefaultAsync(item => item.OrderNumber == reference, cancellationToken);
        if (order is null || order.PaymentMethod != PaymentMethod.Visa)
            return false;

        var amountCents = GetInt64(transaction, "amount_cents");
        var expectedCents = checked((long)Math.Round(order.Total * 100, MidpointRounding.AwayFromZero));
        if (amountCents != expectedCents)
            return false;

        var isRefund = GetBoolean(transaction, "is_refund");
        var isVoided = GetBoolean(transaction, "is_voided");
        var success = GetBoolean(transaction, "success") &&
            !GetBoolean(transaction, "error_occured") && !isRefund && !isVoided;
        var status = isRefund || isVoided ? PaymentStatus.Cancelled :
            success ? PaymentStatus.Paid :
            GetBoolean(transaction, "pending") ? PaymentStatus.Pending : PaymentStatus.Failed;

        var payment = await dbContext.Payments.SingleOrDefaultAsync(
            item => item.ProviderTransactionId == transactionId, cancellationToken);
        if (payment?.Status == PaymentStatus.Paid.ToString() && !isRefund && !isVoided)
            status = PaymentStatus.Paid;
        if (payment is null)
        {
            dbContext.Payments.Add(new PaymentRecord
            {
                OrderId = order.Id,
                ProviderTransactionId = transactionId,
                AmountCents = amountCents,
                Status = status.ToString()
            });
        }
        else
        {
            payment.Status = status.ToString();
            payment.AmountCents = amountCents;
            payment.UpdatedAt = DateTime.UtcNow;
        }

        if (isRefund || isVoided)
            order.PaymentStatus = PaymentStatus.Cancelled;
        else if (order.PaymentStatus != PaymentStatus.Paid || status == PaymentStatus.Paid)
            order.PaymentStatus = status;
        await dbContext.SaveChangesAsync(cancellationToken);
        return true;
    }

    private static bool ValidateHmac(JsonElement obj, string providedHmac, string secret)
    {
        string[] fields =
        [
            "amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction",
            "id", "integration_id", "is_3d_secure", "is_auth", "is_capture", "is_refund",
            "is_standalone_payment", "is_voided", "order.id", "owner", "parent_transaction"
        ];
        var values = new StringBuilder();
        foreach (var field in fields)
        {
            var value = field == "order.id"
                ? (obj.TryGetProperty("order", out var order) && order.TryGetProperty("id", out var orderId) ? Scalar(orderId) : "")
                : obj.TryGetProperty(field, out var element) ? Scalar(element) : "";
            values.Append(value);
        }

        var computed = Convert.ToHexString(HMACSHA512.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(values.ToString())));
        try
        {
            return CryptographicOperations.FixedTimeEquals(
                Convert.FromHexString(computed),
                Convert.FromHexString(providedHmac));
        }
        catch (FormatException)
        {
            return false;
        }
    }

    private static string Scalar(JsonElement element) => element.ValueKind switch
    {
        JsonValueKind.String => element.GetString() ?? "",
        JsonValueKind.True => "true",
        JsonValueKind.False => "false",
        JsonValueKind.Number => element.GetRawText(),
        _ => ""
    };

    private static string? GetString(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) ? Scalar(value) : null;
    private static long GetInt64(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.TryGetInt64(out var number) ? number : -1;
    private static bool GetBoolean(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.True;
    private static bool IsHttpsUrl(string? value) =>
        Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps;
}
