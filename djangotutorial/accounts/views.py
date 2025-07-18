from django.http import HttpResponseRedirect
from django.shortcuts import redirect, render
from django.urls import reverse


def login_view(request):
    from django.contrib.auth import authenticate, login

    if request.method == "POST":
        username = request.POST.get("username")
        password = request.POST.get("password")
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            return HttpResponseRedirect(reverse("polls:index"))
        else:
            return render(request, "accounts/login.html",
                          {"error_message": "Invalid login."})
    else:
        # Render the login form
        return render(request, "accounts/login.html")


def logout_view(request):
    from django.contrib.auth import logout

    logout(request)
    return redirect(
        "polls:index")  # Redirect to the index page of the polls app


def theme_css(request):
    from django.conf import settings
    from django.http import HttpResponse
    from django.template.loader import render_to_string
    """
    Serve the theme CSS file.
    """
    css = render_to_string('theme.css',
                           {'THEME_COLORS': settings.THEME_COLORS})
    return HttpResponse(css, content_type='text/css')
