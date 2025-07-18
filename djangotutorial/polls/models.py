import datetime

from django.contrib import admin
from django.db import models
from django.utils import timezone


class Question(models.Model):
    question_text = models.CharField(max_length=200)
    pub_date = models.DateTimeField("date published")

    def __str__(self):
        return self.question_text

    @admin.display(
        boolean=True,
        ordering="pub_date",
        description="Published recently?",
    )
    def was_published_recently(self):
        now = timezone.now()
        return now - datetime.timedelta(days=1) <= self.pub_date <= now


class Choice(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE)
    choice_text = models.CharField(max_length=200)
    votes = models.IntegerField(default=0)

    def __str__(self):
        return self.choice_text


class Conversation(models.Model):
    """
    A chat session. We key off session_key (you could also tie to a User FK).
    """
    session_key = models.CharField(max_length=40, db_index=True)
    started_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        return f"Conv {self.pk} ({self.session_key})"


class Message(models.Model):
    """
    One message in a conversation, either from the user or the assistant.
    If it's a 'cards' payload, content will be null and cards_json will hold the cards.
    """
    ROLE_CHOICES = [
        ('user', 'User'),
        ('assistant', 'Assistant'),
    ]

    conversation = models.ForeignKey(Conversation,
                                     on_delete=models.CASCADE,
                                     related_name="messages")
    role = models.CharField(choices=ROLE_CHOICES, max_length=10)
    content = models.TextField(null=True, blank=True)
    cards_json = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"[{self.role}] {self.content or '(cards)'}"


class Anime(models.Model):
    name = models.CharField(max_length=200, unique=True)
    slug = models.SlugField(unique=True)  # or drop if you’ll use id only

    class Meta:
        db_table = "anime"  # matches the table you created
        managed = False  # Django won’t try to re-create it
