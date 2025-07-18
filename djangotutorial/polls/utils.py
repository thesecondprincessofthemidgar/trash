def get_session_id(request):
    if not request.session.session_key:
        request.session.save()  # создаёт новую сессию, если ещё нет
    return request.session.session_key

def add_message(request, role, content, cards=None):
    from .models import Message
    session_id = get_session_id(request)
    Message.objects.create(
        session_id=session_id,
        role=role,
        content=content,
        cards=cards if cards is not None else None,
    )

def get_history(request):
    from .models import Message
    session_id = get_session_id(request)
    return Message.objects.filter(session_id=session_id).order_by('created_at')
