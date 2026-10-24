using Microsoft.EntityFrameworkCore;

namespace Kadry.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Category> Categories => Set<Category>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<CustomerOrder> Orders => Set<CustomerOrder>();
    public DbSet<OrderItem> OrderItems => Set<OrderItem>();
    public DbSet<AdminUser> AdminUsers => Set<AdminUser>();
    public DbSet<PaymentRecord> Payments => Set<PaymentRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Category>().HasIndex(category => category.Name).IsUnique();
        modelBuilder.Entity<Product>().Property(product => product.Price).HasPrecision(10, 2);
        modelBuilder.Entity<Product>().HasQueryFilter(product => !product.IsDeleted);
        modelBuilder.Entity<CustomerOrder>().HasIndex(order => order.OrderNumber).IsUnique();
        modelBuilder.Entity<CustomerOrder>().HasIndex(order => order.IdempotencyKey)
            .IsUnique().HasFilter("IdempotencyKey IS NOT NULL");
        modelBuilder.Entity<CustomerOrder>().Property(order => order.Subtotal).HasPrecision(10, 2);
        modelBuilder.Entity<CustomerOrder>().Property(order => order.DeliveryFee).HasPrecision(10, 2);
        modelBuilder.Entity<CustomerOrder>().Property(order => order.Total).HasPrecision(10, 2);
        modelBuilder.Entity<OrderItem>().Property(item => item.UnitPrice).HasPrecision(10, 2);
        modelBuilder.Entity<AdminUser>().HasIndex(user => user.Username).IsUnique();
        modelBuilder.Entity<PaymentRecord>().HasIndex(payment => payment.ProviderTransactionId).IsUnique();
    }
}
