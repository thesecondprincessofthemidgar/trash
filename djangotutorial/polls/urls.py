from django.urls import path, re_path
from polls import views as polls_views

from . import views

app_name = "polls"
urlpatterns = [
    path("search/", views.search, name="search"),
    re_path(r'^media-proxy/(?P<path>.+)$',
            polls_views.media_proxy,
            name='media_proxy'),
]
