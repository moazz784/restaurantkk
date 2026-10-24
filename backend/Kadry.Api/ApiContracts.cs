using System.ComponentModel.DataAnnotations;

namespace Kadry.Api;

public sealed record ProductResponse(
    int Id, string Name, string Description, decimal Price, decimal CurrentPrice,
    int CategoryId, string CategoryName, string? ImageUrl, bool Available,
    bool Featured, int DiscountPercent, DateTime CreatedAt, DateTime UpdatedAt);

public sealed record CategoryResponse(int Id, string Name);
public sealed class CategoryRequest
{
    [Required, StringLength(80, MinimumLength = 2)] public string Name { get; init; } = "";
}

public sealed class ProductRequest
{
    [Required, StringLength(140, MinimumLength = 2)] public string Name { get; init; } = "";
    [Required, StringLength(1200, MinimumLength = 2)] public string Description { get; init; } = "";
    [Range(1, 100000)] public decimal Price { get; init; }
    [Range(1, int.MaxValue)] public int CategoryId { get; init; }
    [Required, StringLength(600)] public string ImageUrl { get; init; } = "";
    public bool Available { get; init; } = true;
    public bool Featured { get; init; }
    [Range(0, 90)] public int DiscountPercent { get; init; }
}

public sealed class CreateOrderRequest
{
    [Required, StringLength(120, MinimumLength = 2)] public string CustomerName { get; init; } = "";
    [Required, RegularExpression(@"^(?:\+?20|0)?1[0125]\d{8}$")] public string Phone { get; init; } = "";
    [Required, StringLength(500, MinimumLength = 5)] public string Address { get; init; } = "";
    [StringLength(700)] public string? Notes { get; init; }
    [Required] public string PaymentMethod { get; init; } = "";
    [Required, MinLength(1), MaxLength(40)] public List<CreateOrderItemRequest> Items { get; init; } = [];
}

public sealed class CreateOrderItemRequest
{
    [Range(1, int.MaxValue)] public int ProductId { get; init; }
    [Range(1, 50)] public int Quantity { get; init; }
    [StringLength(300)] public string? Note { get; init; }
}

public sealed record OrderCreatedResponse(string OrderNumber, decimal Subtotal, decimal DeliveryFee, decimal Total);
public sealed record OrderTrackingResponse(
    string OrderNumber, string Status, string PaymentMethod, string PaymentStatus, DateTime CreatedAt);
public sealed record AdminLoginRequest(
    [Required, StringLength(60)] string Username,
    [Required, StringLength(200)] string Password);
public sealed record BootstrapAdminRequest(
    [Required, StringLength(60)] string Username,
    [Required, StringLength(200, MinimumLength = 12)] string Password,
    [Required] string BootstrapToken);
public sealed record AdminLoginResponse(string Token, DateTime ExpiresAt);
public sealed record UpdateOrderStatusRequest([Required] string Status);
public sealed record DashboardResponse(int TotalOrders, int NewOrders, int TotalProducts, decimal VerifiedSales);
public sealed record OrderItemResponse(string ProductName, decimal UnitPrice, int Quantity, string? Note);
public sealed record AdminOrderResponse(
    Guid Id, string OrderNumber, string CustomerName, string Phone, string Address, string? Notes,
    string PaymentMethod, string PaymentStatus, string Status, decimal Subtotal, decimal DeliveryFee,
    decimal Total, DateTime CreatedAt, IReadOnlyList<OrderItemResponse> Items);
