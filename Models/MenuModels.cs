namespace HometownGrub.Models;

public class RestaurantMenu
{
    public string RestaurantName { get; set; } = "";
    public string Theme { get; set; } = "light";
    public List<MenuPage> Pages { get; set; } = new();
}

public class MenuPage
{
    public string Title { get; set; } = "";
    public List<MenuItem> Items { get; set; } = new();
}

public class MenuItem
{
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Price { get; set; } = "";
}
