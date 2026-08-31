# OreMine Wiki

## Локальный запуск через Docker

Запустите Docker Desktop, затем выполните из корня проекта:

```powershell
docker compose up
```

Сайт откроется по адресу <http://localhost:4000>. Jekyll отслеживает изменения
файлов, а браузер автоматически обновляет страницу через LiveReload.

Остановить сервер можно сочетанием `Ctrl+C`. Удалить созданный контейнер:

```powershell
docker compose down
```
