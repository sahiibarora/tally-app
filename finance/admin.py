from django.contrib import admin
from .models import Account, Category, Entry, Budget, Goal, Preference

admin.site.register(Account)
admin.site.register(Category)
admin.site.register(Entry)
admin.site.register(Budget)
admin.site.register(Goal)
admin.site.register(Preference)
