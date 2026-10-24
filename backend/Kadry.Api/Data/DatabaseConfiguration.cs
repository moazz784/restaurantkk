using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;

namespace Kadry.Api.Data;

public static class DatabaseConfiguration
{
    public static string GetConnectionString(IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                "Missing ConnectionStrings:DefaultConnection. Run the API in Development to use the local SQLite database, " +
                "or configure a persistent SQLite connection string for this environment.");
        }

        var sqliteConnection = new SqliteConnectionStringBuilder(connectionString);
        if (string.IsNullOrWhiteSpace(sqliteConnection.DataSource) ||
            string.Equals(sqliteConnection.DataSource, ":memory:", StringComparison.OrdinalIgnoreCase) ||
            sqliteConnection.Mode == SqliteOpenMode.Memory)
        {
            throw new InvalidOperationException("The SQLite connection must point to a persistent database file.");
        }

        var localDataDirectory = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrWhiteSpace(localDataDirectory))
        {
            throw new InvalidOperationException("The local application data directory could not be determined.");
        }

        var databasePath = Path.IsPathRooted(sqliteConnection.DataSource)
            ? sqliteConnection.DataSource
            : Path.Combine(localDataDirectory, "Kadry", sqliteConnection.DataSource);
        databasePath = Path.GetFullPath(databasePath);

        var databaseDirectory = Path.GetDirectoryName(databasePath);
        if (!string.IsNullOrEmpty(databaseDirectory))
        {
            Directory.CreateDirectory(databaseDirectory);
        }

        sqliteConnection.DataSource = databasePath;
        return sqliteConnection.ToString();
    }
}
