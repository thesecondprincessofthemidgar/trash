class MediaRouter:
    app_label = "polls"

    def db_for_read(self, model, **hints):
        return "media" if model._meta.app_label == self.app_label else None

    def db_for_write(self, model, **hints):
        return "media" if model._meta.app_label == self.app_label else None
