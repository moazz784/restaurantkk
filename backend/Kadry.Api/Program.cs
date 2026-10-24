using System.ComponentModel.DataAnnotations;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Kadry.Api;
using Kadry.Api.Data;
using Kadry.Api.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.FileProviders;
using Microsoft.IdentityModel.Tokens;
using System.Threading.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
var connectionString = DatabaseConfiguration.GetConnectionString(builder.Configuration);

var jwtSecret = builder.Configuration["Authentication:JwtSecret"];
if (string.IsNullOrWhiteSpace(jwtSecret) || Encoding.UTF8.GetByteCount(jwtSecret) < 32)
    throw new InvalidOperationException("Configure Authentication__JwtSecret with a secret of at least 32 bytes.");

builder.Services.AddDbContext<AppDbContext>(options => options.UseSqlite(connectionString));
builder.Services.AddScoped<IPasswordHasher<AdminUser>, PasswordHasher<AdminUser>>();
builder.Services.AddSingleton<IImageStorage, ImageStorage>();
builder.Services.AddHttpClient("Paymob", client =>
{
    client.BaseAddress = new Uri("https://accept.paymob.com/");
    client.Timeout = TimeSpan.FromSeconds(20);
});
builder.Services.AddScoped<PaymobService>();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.Configure<FormOptions>(options =>
    options.MultipartBodyLengthLimit = 6 * 1024 * 1024);

var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret));
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = builder.Configuration["Authentication:Issuer"] ?? "Kadry.Api",
            ValidateAudience = true,
            ValidAudience = builder.Configuration["Authentication:Audience"] ?? "Kadry.Admin",
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = signingKey,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(options =>
{
    options.AddPolicy("admin-auth", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(5),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
});

var allowedOrigins = (builder.Configuration["CORS_ALLOWED_ORIGINS"] ?? "http://localhost:5173")
    .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
builder.Services.AddCors(options => options.AddPolicy("frontend", policy =>
    policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();

app.Use(async (context, next) =>
{
    try
    {
        await next();
    }
    catch (InvalidDataException exception)
    {
        app.Logger.LogWarning(exception, "Request validation failed.");
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        await context.Response.WriteAsJsonAsync(new { message = exception.Message });
    }
    catch (InvalidOperationException exception)
    {
        app.Logger.LogError(exception, "A required external service is unavailable or misconfigured.");
        context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
        await context.Response.WriteAsJsonAsync(new { message = exception.Message });
    }
    catch (Exception exception)
    {
        app.Logger.LogError(exception, "Unhandled API error.");
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await context.Response.WriteAsJsonAsync(new
        {
            title = "تعذر إكمال الطلب بسبب خطأ داخلي.",
            traceId = context.TraceIdentifier
        });
    }
});

app.UseRouting();
app.UseCors("frontend");
if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
var webRootPath = app.Environment.WebRootPath ?? Path.Combine(app.Environment.ContentRootPath, "wwwroot");
Directory.CreateDirectory(Path.Combine(webRootPath, "uploads"));
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(webRootPath)
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

var api = app.MapGroup("/api");

api.MapGet("/health", () => Results.Ok(new { status = "ok" })).AllowAnonymous();
api.MapGet("/store/settings", (IConfiguration configuration) =>
    Results.Ok(new { deliveryFee = configuration.GetValue<decimal>("DeliveryFee", 35m) })).AllowAnonymous();
api.MapGet("/categories", async (AppDbContext db, CancellationToken cancellationToken) =>
{
    var categories = await db.Categories.AsNoTracking().Where(category => category.Active)
        .OrderBy(category => category.Id)
        .Select(category => new CategoryResponse(category.Id, category.Name))
        .ToListAsync(cancellationToken);
    return Results.Ok(categories);
}).AllowAnonymous();

api.MapGet("/products", async (
    AppDbContext db, bool? featured, string? category, string? search, CancellationToken cancellationToken) =>
{
    var query = db.Products.AsNoTracking().Include(product => product.Category)
        .Where(product => product.Available && product.Category.Active);
    if (featured is true) query = query.Where(product => product.Featured);
    if (!string.IsNullOrWhiteSpace(category)) query = query.Where(product => product.Category.Name == category);
    if (!string.IsNullOrWhiteSpace(search))
    {
        var queryText = search.Trim();
        query = query.Where(product => product.Name.Contains(queryText) || product.Description.Contains(queryText));
    }

    var entities = await query.OrderByDescending(product => product.Featured).ThenBy(product => product.Name)
        .ToListAsync(cancellationToken);
    var products = entities.Select(ToProductResponse).ToList();
    return Results.Ok(products);
}).AllowAnonymous();

api.MapGet("/products/{id:int}", async (int id, AppDbContext db, CancellationToken cancellationToken) =>
{
    var product = await db.Products.AsNoTracking().Include(item => item.Category)
        .SingleOrDefaultAsync(item => item.Id == id && item.Available && item.Category.Active, cancellationToken);
    return product is null ? Results.NotFound(new { message = "المنتج غير متاح." }) : Results.Ok(ToProductResponse(product));
}).AllowAnonymous();

api.MapPost("/orders", async (
    CreateOrderRequest request, HttpContext http, AppDbContext db, IConfiguration configuration, CancellationToken cancellationToken) =>
{
    var validation = Validate(request);
    if (validation.Count != 0) return Results.ValidationProblem(validation);
    for (var index = 0; index < request.Items.Count; index++)
    {
        var itemErrors = Validate(request.Items[index]);
        if (itemErrors.Count != 0)
            return Results.ValidationProblem(itemErrors.ToDictionary(
                pair => $"items[{index}].{pair.Key}", pair => pair.Value));
    }
    if (!Enum.TryParse<PaymentMethod>(request.PaymentMethod, ignoreCase: false, out var paymentMethod))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["paymentMethod"] = ["طريقة الدفع غير مدعومة."] });

    var key = http.Request.Headers["Idempotency-Key"].FirstOrDefault()?.Trim();
    if (key?.Length > 80) return Results.ValidationProblem(new Dictionary<string, string[]> { ["idempotencyKey"] = ["معرّف الطلب طويل جدًا."] });
    if (!string.IsNullOrWhiteSpace(key))
    {
        var previous = await db.Orders.AsNoTracking().SingleOrDefaultAsync(order => order.IdempotencyKey == key, cancellationToken);
        if (previous is not null)
            return Results.Ok(new OrderCreatedResponse(previous.OrderNumber, previous.Subtotal, previous.DeliveryFee, previous.Total));
    }

    var requestedIds = request.Items.Select(item => item.ProductId).Distinct().ToArray();
    var products = await db.Products.Include(product => product.Category)
        .Where(product => requestedIds.Contains(product.Id) && product.Available && product.Category.Active)
        .ToDictionaryAsync(product => product.Id, cancellationToken);
    if (products.Count != requestedIds.Length)
        return Results.Conflict(new { message = "بعض المنتجات لم تعد متاحة. حدّث السلة وحاول مرة أخرى." });

    var subtotal = 0m;
    var orderItems = new List<OrderItem>();
    foreach (var item in request.Items)
    {
        if (!products.TryGetValue(item.ProductId, out var product))
            return Results.Conflict(new { message = "أحد المنتجات لم يعد متاحًا." });
        if (item.Quantity is < 1 or > 50)
            return Results.ValidationProblem(new Dictionary<string, string[]> { ["items"] = ["الكمية غير صالحة."] });
        var unitPrice = decimal.Round(product.Price * (100 - product.DiscountPercent) / 100m, 2, MidpointRounding.AwayFromZero);
        subtotal += unitPrice * item.Quantity;
        orderItems.Add(new OrderItem
        {
            ProductId = product.Id,
            ProductName = product.Name,
            UnitPrice = unitPrice,
            Quantity = item.Quantity,
            Note = item.Note?.Trim()
        });
    }

    var deliveryFee = builder.Configuration.GetValue<decimal>("DeliveryFee", 35m);
    var order = new CustomerOrder
    {
        OrderNumber = $"KDR-{DateTime.UtcNow:yyMMdd}-{RandomNumberGenerator.GetInt32(100000, 999999)}",
        CustomerName = request.CustomerName.Trim(),
        Phone = Regex.Replace(request.Phone, @"[\s-]", ""),
        Address = request.Address.Trim(),
        Notes = request.Notes?.Trim(),
        PaymentMethod = paymentMethod,
        PaymentStatus = paymentMethod == PaymentMethod.Visa ? PaymentStatus.Pending : PaymentStatus.NotRequired,
        Subtotal = subtotal,
        DeliveryFee = deliveryFee,
        Total = subtotal + deliveryFee,
        IdempotencyKey = string.IsNullOrWhiteSpace(key) ? null : key,
        Items = orderItems
    };
    db.Orders.Add(order);
    await db.SaveChangesAsync(cancellationToken);
    return Results.Created($"/api/orders/track/{order.OrderNumber}",
        new OrderCreatedResponse(order.OrderNumber, order.Subtotal, order.DeliveryFee, order.Total));
}).AllowAnonymous();

api.MapGet("/orders/track/{orderNumber}", async (string orderNumber, AppDbContext db, CancellationToken cancellationToken) =>
{
    var order = await db.Orders.AsNoTracking()
        .Where(item => item.OrderNumber == orderNumber)
        .Select(item => new OrderTrackingResponse(
            item.OrderNumber, item.Status.ToString(), item.PaymentMethod.ToString(),
            item.PaymentStatus.ToString(), item.CreatedAt))
        .SingleOrDefaultAsync(cancellationToken);
    return order is null ? Results.NotFound(new { message = "رقم الطلب غير موجود." }) : Results.Ok(order);
}).AllowAnonymous();

api.MapPost("/payments/{orderNumber}/checkout", async (
    string orderNumber, AppDbContext db, PaymobService paymob, CancellationToken cancellationToken) =>
{
    var order = await db.Orders.Include(item => item.Items)
        .SingleOrDefaultAsync(item => item.OrderNumber == orderNumber, cancellationToken);
    if (order is null) return Results.NotFound(new { message = "الطلب غير موجود." });
    if (order.PaymentMethod != PaymentMethod.Visa) return Results.Conflict(new { message = "هذا الطلب لا يستخدم الدفع بالبطاقة." });
    if (order.PaymentStatus == PaymentStatus.Paid) return Results.Conflict(new { message = "تم تأكيد الدفع بالفعل." });
    var checkoutUrl = await paymob.CreateCheckoutAsync(order, cancellationToken);
    return Results.Ok(new { checkoutUrl });
}).AllowAnonymous();

api.MapPost("/payments/webhook", async (
    System.Text.Json.JsonElement payload, HttpContext http, PaymobService paymob, CancellationToken cancellationToken) =>
{
    var hmac = http.Request.Query["hmac"].FirstOrDefault();
    if (string.IsNullOrWhiteSpace(hmac) && payload.TryGetProperty("hmac", out var signature))
        hmac = signature.GetString();
    var accepted = await paymob.ProcessWebhookAsync(payload, hmac, cancellationToken);
    return accepted ? Results.Ok() : Results.Unauthorized();
}).AllowAnonymous();

var auth = api.MapGroup("/admin/auth");
auth.MapPost("/bootstrap", async (
    BootstrapAdminRequest request, AppDbContext db, IConfiguration configuration,
    IPasswordHasher<AdminUser> passwordHasher, CancellationToken cancellationToken) =>
{
    var validation = Validate(request);
    if (validation.Count != 0) return Results.ValidationProblem(validation);
    var configuredToken = configuration["Bootstrap:Token"];
    if (string.IsNullOrWhiteSpace(configuredToken) || !FixedEquals(request.BootstrapToken, configuredToken))
        return Results.Unauthorized();
    if (await db.AdminUsers.AnyAsync(cancellationToken))
        return Results.Conflict(new { message = "تم إنشاء حساب المدير بالفعل." });
    var user = new AdminUser { Username = request.Username.Trim() };
    user.PasswordHash = passwordHasher.HashPassword(user, request.Password);
    db.AdminUsers.Add(user);
    await db.SaveChangesAsync(cancellationToken);
    return Results.Created("/api/admin/auth/login", new { message = "تم إنشاء حساب المدير. احذف رمز التهيئة من إعدادات البيئة." });
}).AllowAnonymous().RequireRateLimiting("admin-auth");

auth.MapPost("/login", async (
    AdminLoginRequest request, AppDbContext db, IConfiguration configuration,
    IPasswordHasher<AdminUser> passwordHasher, CancellationToken cancellationToken) =>
{
    var validation = Validate(request);
    if (validation.Count != 0) return Results.ValidationProblem(validation);
    var user = await db.AdminUsers.SingleOrDefaultAsync(
        item => item.Username == request.Username.Trim(), cancellationToken);
    if (user is null || passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password) == PasswordVerificationResult.Failed)
        return Results.Unauthorized();

    var expiresAt = DateTime.UtcNow.AddHours(8);
    var claims = new[]
    {
        new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
        new Claim(ClaimTypes.Name, user.Username),
        new Claim(ClaimTypes.Role, "Admin")
    };
    var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);
    var jwt = new JwtSecurityToken(
        issuer: configuration["Authentication:Issuer"] ?? "Kadry.Api",
        audience: configuration["Authentication:Audience"] ?? "Kadry.Admin",
        claims: claims,
        expires: expiresAt,
        signingCredentials: credentials);
    return Results.Ok(new AdminLoginResponse(new JwtSecurityTokenHandler().WriteToken(jwt), expiresAt));
}).AllowAnonymous().RequireRateLimiting("admin-auth");

var admin = api.MapGroup("/admin").RequireAuthorization();

admin.MapGet("/categories", async (AppDbContext db, CancellationToken cancellationToken) =>
{
    var categories = await db.Categories.AsNoTracking().OrderBy(category => category.Name)
        .Select(category => new { category.Id, category.Name, category.Active })
        .ToListAsync(cancellationToken);
    return Results.Ok(categories);
});

admin.MapPost("/categories", async (CategoryRequest request, AppDbContext db, CancellationToken cancellationToken) =>
{
    var validation = Validate(request);
    if (validation.Count != 0) return Results.ValidationProblem(validation);
    var name = request.Name.Trim();
    if (await db.Categories.AnyAsync(category => category.Name == name, cancellationToken))
        return Results.Conflict(new { message = "يوجد تصنيف بهذا الاسم بالفعل." });
    var category = new Category { Name = name };
    db.Categories.Add(category);
    await db.SaveChangesAsync(cancellationToken);
    return Results.Created($"/api/categories/{category.Id}", new CategoryResponse(category.Id, category.Name));
});

admin.MapPut("/categories/{id:int}", async (
    int id, CategoryRequest request, AppDbContext db, CancellationToken cancellationToken) =>
{
    var validation = Validate(request);
    if (validation.Count != 0) return Results.ValidationProblem(validation);
    var category = await db.Categories.SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
    if (category is null) return Results.NotFound(new { message = "التصنيف غير موجود." });
    var name = request.Name.Trim();
    if (await db.Categories.AnyAsync(item => item.Id != id && item.Name == name, cancellationToken))
        return Results.Conflict(new { message = "يوجد تصنيف بهذا الاسم بالفعل." });
    category.Name = name;
    await db.SaveChangesAsync(cancellationToken);
    return Results.Ok(new CategoryResponse(category.Id, category.Name));
});

admin.MapPatch("/categories/{id:int}/active", async (
    int id, bool active, AppDbContext db, CancellationToken cancellationToken) =>
{
    var category = await db.Categories.SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
    if (category is null) return Results.NotFound(new { message = "التصنيف غير موجود." });
    category.Active = active;
    await db.SaveChangesAsync(cancellationToken);
    return Results.NoContent();
});

admin.MapGet("/dashboard", async (AppDbContext db, CancellationToken cancellationToken) =>
{
    var totalOrders = await db.Orders.CountAsync(cancellationToken);
    var newOrders = await db.Orders.CountAsync(order => order.Status == OrderStatus.New, cancellationToken);
    var totalProducts = await db.Products.CountAsync(cancellationToken);
    var salesValues = await db.Orders.AsNoTracking().Where(order =>
            order.PaymentStatus == PaymentStatus.Paid ||
            (order.PaymentMethod == PaymentMethod.CashOnDelivery && order.Status == OrderStatus.Delivered))
        .Select(order => order.Total)
        .ToListAsync(cancellationToken);
    var sales = salesValues.Sum();
    return Results.Ok(new DashboardResponse(totalOrders, newOrders, totalProducts, sales));
});

admin.MapGet("/products", async (AppDbContext db, CancellationToken cancellationToken) =>
{
    var entities = await db.Products.AsNoTracking().Include(product => product.Category)
        .OrderByDescending(product => product.CreatedAt)
        .ToListAsync(cancellationToken);
    var products = entities.Select(ToProductResponse).ToList();
    return Results.Ok(products);
});

admin.MapPost("/products", async (ProductRequest request, AppDbContext db, CancellationToken cancellationToken) =>
{
    var validation = Validate(request);
    if (validation.Count != 0) return Results.ValidationProblem(validation);
    var category = await db.Categories.SingleOrDefaultAsync(item => item.Id == request.CategoryId, cancellationToken);
    if (category is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["categoryId"] = ["التصنيف غير موجود."] });
    var product = new Product
    {
        Name = request.Name.Trim(), Description = request.Description.Trim(), Price = request.Price,
        CategoryId = request.CategoryId, ImageUrl = NormalizeImageUrl(request.ImageUrl),
        Available = request.Available, Featured = request.Featured, DiscountPercent = request.DiscountPercent
    };
    db.Products.Add(product);
    await db.SaveChangesAsync(cancellationToken);
    await db.Entry(product).Reference(item => item.Category).LoadAsync(cancellationToken);
    return Results.Created($"/api/products/{product.Id}", ToProductResponse(product));
});

admin.MapPut("/products/{id:int}", async (
    int id, ProductRequest request, AppDbContext db, CancellationToken cancellationToken) =>
{
    var validation = Validate(request);
    if (validation.Count != 0) return Results.ValidationProblem(validation);
    var product = await db.Products.SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
    if (product is null) return Results.NotFound(new { message = "المنتج غير موجود." });
    if (!await db.Categories.AnyAsync(category => category.Id == request.CategoryId, cancellationToken))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["categoryId"] = ["التصنيف غير موجود."] });

    product.Name = request.Name.Trim();
    product.Description = request.Description.Trim();
    product.Price = request.Price;
    product.CategoryId = request.CategoryId;
    product.ImageUrl = NormalizeImageUrl(request.ImageUrl);
    product.Available = request.Available;
    product.Featured = request.Featured;
    product.DiscountPercent = request.DiscountPercent;
    product.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync(cancellationToken);
    await db.Entry(product).Reference(item => item.Category).LoadAsync(cancellationToken);
    return Results.Ok(ToProductResponse(product));
});

admin.MapDelete("/products/{id:int}", async (int id, AppDbContext db, CancellationToken cancellationToken) =>
{
    var product = await db.Products.SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
    if (product is null) return Results.NotFound(new { message = "المنتج غير موجود." });
    product.IsDeleted = true;
    product.UpdatedAt = DateTime.UtcNow;
    await db.SaveChangesAsync(cancellationToken);
    return Results.NoContent();
});

admin.MapPost("/uploads/images", async (
    IFormFile file, IImageStorage imageStorage, CancellationToken cancellationToken) =>
{
    if (file is null) return Results.ValidationProblem(new Dictionary<string, string[]> { ["file"] = ["اختر صورة لرفعها."] });
    var url = await imageStorage.SaveAsync(file, cancellationToken);
    return Results.Ok(new { imageUrl = url });
}).DisableAntiforgery();

admin.MapGet("/orders", async (AppDbContext db, string? status, DateTime? from, DateTime? to, CancellationToken cancellationToken) =>
{
    var query = db.Orders.AsNoTracking().Include(order => order.Items).AsQueryable();
    if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<OrderStatus>(status, out var parsedStatus))
        query = query.Where(order => order.Status == parsedStatus);
    if (from.HasValue) query = query.Where(order => order.CreatedAt >= from.Value.ToUniversalTime());
    if (to.HasValue) query = query.Where(order => order.CreatedAt < to.Value.ToUniversalTime().AddDays(1));
    var entities = await query.OrderByDescending(order => order.CreatedAt).ToListAsync(cancellationToken);
    var orders = entities.Select(ToAdminOrderResponse).ToList();
    return Results.Ok(orders);
});

admin.MapGet("/orders/{id:guid}", async (Guid id, AppDbContext db, CancellationToken cancellationToken) =>
{
    var order = await db.Orders.AsNoTracking().Include(item => item.Items)
        .SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
    return order is null ? Results.NotFound(new { message = "الطلب غير موجود." }) : Results.Ok(ToAdminOrderResponse(order));
});

admin.MapPatch("/orders/{id:guid}/status", async (
    Guid id, UpdateOrderStatusRequest request, AppDbContext db, CancellationToken cancellationToken) =>
{
    var validation = Validate(request);
    if (validation.Count != 0 || !Enum.TryParse<OrderStatus>(request.Status, out var status) || !Enum.IsDefined(status))
        return Results.ValidationProblem(new Dictionary<string, string[]> { ["status"] = ["حالة الطلب غير صالحة."] });
    var order = await db.Orders.SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
    if (order is null) return Results.NotFound(new { message = "الطلب غير موجود." });
    if (status == OrderStatus.Delivered && order.PaymentMethod == PaymentMethod.Visa && order.PaymentStatus != PaymentStatus.Paid)
        return Results.Conflict(new { message = "لا يمكن إتمام طلب البطاقة قبل التحقق من الدفع عبر Paymob." });
    order.Status = status;
    await db.SaveChangesAsync(cancellationToken);
    return Results.NoContent();
});

await using (var scope = app.Services.CreateAsyncScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.MigrateAsync();
    if (!await db.Categories.AnyAsync())
    {
        db.Categories.AddRange(
            new Category { Name = "سوشي" },
            new Category { Name = "حواوشي" },
            new Category { Name = "وجبات" },
            new Category { Name = "العروض" });
        await db.SaveChangesAsync();
    }
}

app.Run();

static ProductResponse ToProductResponse(Product product) => new(
    product.Id, product.Name, product.Description, product.Price,
    decimal.Round(product.Price * (100 - product.DiscountPercent) / 100m, 2, MidpointRounding.AwayFromZero),
    product.CategoryId, product.Category.Name, product.ImageUrl, product.Available,
    product.Featured, product.DiscountPercent, product.CreatedAt, product.UpdatedAt);

static AdminOrderResponse ToAdminOrderResponse(CustomerOrder order) => new(
    order.Id, order.OrderNumber, order.CustomerName, order.Phone, order.Address, order.Notes,
    order.PaymentMethod.ToString(), order.PaymentStatus.ToString(), order.Status.ToString(),
    order.Subtotal, order.DeliveryFee, order.Total, order.CreatedAt,
    order.Items.Select(item => new OrderItemResponse(item.ProductName, item.UnitPrice, item.Quantity, item.Note)).ToList());

static Dictionary<string, string[]> Validate(object instance)
{
    var results = new List<ValidationResult>();
    Validator.TryValidateObject(instance, new ValidationContext(instance), results, validateAllProperties: true);
    return results
        .SelectMany(result => result.MemberNames.Select(member => (member, result.ErrorMessage)))
        .GroupBy(item => item.member)
        .ToDictionary(group => group.Key, group => group.Select(item => item.ErrorMessage ?? "القيمة غير صالحة.").ToArray());
}

static string? NormalizeImageUrl(string? imageUrl)
{
    var value = imageUrl?.Trim();
    if (string.IsNullOrEmpty(value)) return null;
    if (value.StartsWith("/uploads/", StringComparison.Ordinal)) return value;
    if (Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme is "https" or "http") return uri.ToString();
    throw new InvalidDataException("رابط الصورة غير صالح.");
}

static bool FixedEquals(string first, string second)
{
    var left = Encoding.UTF8.GetBytes(first);
    var right = Encoding.UTF8.GetBytes(second);
    return left.Length == right.Length && CryptographicOperations.FixedTimeEquals(left, right);
}
