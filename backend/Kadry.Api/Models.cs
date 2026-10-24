using System.ComponentModel.DataAnnotations;

namespace Kadry.Api;

public sealed class Category
{
    public int Id { get; set; }
    [MaxLength(80)] public required string Name { get; set; }
    public bool Active { get; set; } = true;
    public ICollection<Product> Products { get; set; } = new List<Product>();
}

public sealed class Product
{
    public int Id { get; set; }
    [MaxLength(140)] public required string Name { get; set; }
    [MaxLength(1200)] public required string Description { get; set; }
    public decimal Price { get; set; }
    public int CategoryId { get; set; }
    public Category Category { get; set; } = null!;
    [MaxLength(600)] public string? ImageUrl { get; set; }
    public bool Available { get; set; } = true;
    public bool Featured { get; set; }
    public int DiscountPercent { get; set; }
    public bool IsDeleted { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public ICollection<OrderItem> OrderItems { get; set; } = new List<OrderItem>();
}

public enum OrderStatus
{
    New,
    Confirmed,
    Preparing,
    ReadyForDelivery,
    Delivered,
    Cancelled
}

public enum PaymentMethod
{
    CashOnDelivery,
    Visa
}

public enum PaymentStatus
{
    NotRequired,
    Pending,
    Paid,
    Failed,
    Cancelled
}

public sealed class CustomerOrder
{
    public Guid Id { get; set; } = Guid.NewGuid();
    [MaxLength(24)] public required string OrderNumber { get; set; }
    [MaxLength(120)] public required string CustomerName { get; set; }
    [MaxLength(20)] public required string Phone { get; set; }
    [MaxLength(500)] public required string Address { get; set; }
    [MaxLength(700)] public string? Notes { get; set; }
    public PaymentMethod PaymentMethod { get; set; }
    public PaymentStatus PaymentStatus { get; set; }
    public OrderStatus Status { get; set; } = OrderStatus.New;
    public decimal Subtotal { get; set; }
    public decimal DeliveryFee { get; set; }
    public decimal Total { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    [MaxLength(80)] public string? IdempotencyKey { get; set; }
    public ICollection<OrderItem> Items { get; set; } = new List<OrderItem>();
    public ICollection<PaymentRecord> Payments { get; set; } = new List<PaymentRecord>();
}

public sealed class OrderItem
{
    public int Id { get; set; }
    public Guid OrderId { get; set; }
    public CustomerOrder Order { get; set; } = null!;
    public int? ProductId { get; set; }
    public Product? Product { get; set; }
    [MaxLength(140)] public required string ProductName { get; set; }
    public decimal UnitPrice { get; set; }
    public int Quantity { get; set; }
    [MaxLength(300)] public string? Note { get; set; }
}

public sealed class AdminUser
{
    public int Id { get; set; }
    [MaxLength(60)] public required string Username { get; set; }
    [MaxLength(512)] public string PasswordHash { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class PaymentRecord
{
    public int Id { get; set; }
    public Guid OrderId { get; set; }
    public CustomerOrder Order { get; set; } = null!;
    [MaxLength(100)] public required string ProviderTransactionId { get; set; }
    [MaxLength(24)] public required string Status { get; set; }
    public long AmountCents { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
