from django.contrib import admin
from django.http import HttpResponse
from django.urls import include, path, re_path
from polls import views as polls_views

urlpatterns = [
    path('', polls_views.search, name='home'),
    path("polls/", include("polls.urls")),
    path("admin/", admin.site.urls),
    path('accounts/', include('accounts.urls')),
    path('search/', polls_views.search, name='search'),
    re_path(r"^media-proxy/(?P<path>.+)$", polls_views.media_proxy),
    path('suggestions/', polls_views.suggestions, name='suggestions'),
    path('clear/', polls_views.clear_history, name='clear_history'),
    path('create_sync_room/', polls_views.create_sync_room, name='create_sync_room'),
]
