from django.conf import settings


def theme_colors(request):
    """Add THEME_COLORS from settings to the template context."""
    return {"THEME_COLORS": settings.THEME_COLORS}
