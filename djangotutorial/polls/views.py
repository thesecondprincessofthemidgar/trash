from django.db.models import F
from django.http import HttpResponseRedirect
from django.shortcuts import get_object_or_404, render, redirect
from django.urls import reverse
from django.views import generic

from .models import Choice, Question
from django.utils import timezone

from django.templatetags.static import static
from django.conf import settings

import os, httpx, openai
import re
from .models import Anime
from django.db.models import Q

from django.http import JsonResponse


OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')

import sys
if sys.platform == 'darwin':
    http_client = httpx.Client(proxy='socks5h://host.docker.internal:1080')
else:
    http_client = httpx.Client(proxy='socks5h://ss-local:1080')

client = openai.OpenAI(api_key=OPENAI_API_KEY, http_client=http_client)


def media_proxy(request, path):
    import requests
    from django.conf import settings
    from django.http import StreamingHttpResponse, Http404
    from urllib.parse import quote
    """
    Proxy /media-proxy/<path> → http://127.0.0.1:9000/static/<path>
    supporting byte ranges so HTML5 <video> will stream.
    """
    safe = quote(path, safe='/') 
    upstream = f'http://media-tunnel:8080/{safe}'
    headers = {}
    # Forward Range headers for seeking
    if 'HTTP_RANGE' in request.META:
        headers['Range'] = request.META['HTTP_RANGE']

    resp = requests.get(upstream, headers=headers, stream=True)
    if resp.status_code not in (200, 206):
        raise Http404(f'Upstream returned {resp.status_code}')

    proxy_resp = StreamingHttpResponse(
        resp.iter_content(chunk_size=8192),
        status=resp.status_code,
        content_type=resp.headers.get('Content-Type', 'application/octet-stream')
    )
    for h in ('Content-Length', 'Content-Range', 'Accept-Ranges'):
        if h in resp.headers:
            proxy_resp[h] = resp.headers[h]

    return proxy_resp


def suggestions(request):
    from .models import Anime
    q = request.GET.get('q', '').strip()
    if not q:
        return JsonResponse([], safe=False)

    qs = Anime.objects.filter(name__icontains=q)[:5]
    data = [
        {'id': obj.id, 'text': obj.name}
        for obj in qs
    ]
    return JsonResponse(data, safe=False)


def clear_history(request):
    request.session.pop('chat_messages', None)
    request.session.modified = True
    print('ОЧИСТКА СЕССИИ:', request.session.get('chat_messages'))
    return redirect('search')


def search(request):
    # 1) Очистка истории
    if request.GET.get('clear'):
        request.session.pop('chat_messages', None)
        request.session.modified = True
        return redirect('polls:search')

    # 2) Загружаем историю (без системного сообщения!)
    history = request.session.get('chat_messages', [])
    anime_id = request.GET.get('anime_id')
    episode = request.GET.get('episode')
    if anime_id and episode:
        try:
            anime = Anime.objects.get(id=anime_id)
            room_url = request.build_absolute_uri(f"/?room={anime_id}&anime_id={anime_id}&episode={episode}")
            last_msg = history[-1] if history else {}
            is_duplicate = (
                last_msg.get('role') == 'assistant' and
                last_msg.get('cards') and
                str(last_msg['cards'][0].get('id')) == str(anime_id) and
                str(last_msg['cards'][0].get('episode')) == str(episode)
            )
            if not is_duplicate:
                history.append({
                    'role': 'assistant',
                    'cards': [{
                        'id': anime.id,
                        'title': anime.name,
                        'episode': episode,
                        'description': 'Here it is!',
                        'image': f'{settings.MEDIA_BASE_URL.rstrip("/")}/DB/{anime.id}.jpg',
                        'video': f'{settings.MEDIA_BASE_URL.rstrip("/")}/DB/{anime.id}/{anime.id}.mp4',
                    }]
                })
                print('Сохраняю историю:', history)
                request.session['chat_messages'] = history
                request.session.modified = True
        except Anime.DoesNotExist:
            anime = None
            room_url = ''

    # 3) Системное сообщение всегда ставим первым в каждом запросе к API
    system_context = {
        'role': 'system',
        'content': (
            'Твоя задача - рекомендовать аниме по запросу пользователя.'
            'Если ты понял что хочет пользователь, ответь в формате [title], и больше ничего не добавляй. Обязательно укажи title в квадратных скобках.'
            'Если не уверен, постарайся выяснить, что именно он хочет'
        )
    }

    query = request.GET.get('q', '').strip()
    if query:
        content_history = [m for m in history if m.get('content') is not None and m.get('role') != 'user_to_db']
        messages = [system_context] + content_history + [{'role':'user','content': query}]
        
        q_obj = Q()
        q_obj |= Q(name__icontains=query)
        anime = Anime.objects.filter(q_obj).first()

        if not anime:
            history.append({'role': 'user', 'content': query})
            # 4) Вызов OpenAI
            response = client.responses.create(
                model='gpt-4.1',
                tools=[{'type': 'web_search_preview'}],
                input=messages,
            )

            assistant_content = response.output_text
            history.append({'role': 'assistant', 'content': assistant_content})

            # 5) Ищем первое вхождение [title]
            m = re.search(r'\[([^\]]+)\]', assistant_content)
            anime = None
            if m:
                title = m.group(1)
                print(f'Searching for title: {title}')
                q_obj |= Q(name__icontains=title)
                anime = Anime.objects.filter(q_obj).first()

        # 6) Добавляем карточку с аниме, если нашли
        if anime:
            history.append({'role': 'user_to_db', 'content': query})
            base = settings.MEDIA_BASE_URL.rstrip('/') + '/'
            history.append({
                'role': 'assistant',
                'cards': [{
                    'id': anime.id,
                    'title': anime.name,
                    'episode': 0,
                    'description': 'Here it is!',
                    'image': f'{base}DB/{anime.id}.jpg',
                    'video': f'{base}DB/{anime.id}/{anime.id}.mp4',
                }]
            })

        # 8) Сохраняем обновлённую историю
        print('Сохраняю историю:', history)
        request.session['chat_messages'] = history
        request.session.modified = True

    # 9) Рендерим всегда на выходе
    if request.headers.get('x-requested-with') == 'XMLHttpRequest':
        return JsonResponse({'messages': history}, safe=False)
    return render(request, 'polls/search.html', {"messages": history})


import uuid
def create_sync_room(request):
    room_id = str(uuid.uuid4())[:8]  # короткий id
    anime_id = request.GET.get('anime_id')
    episode = request.GET.get('episode')
    room_id = str(uuid.uuid4())[:8]
    url = request.build_absolute_uri(f"/?room={room_id}&anime_id={anime_id}&episode={episode}")
    return redirect(url)
