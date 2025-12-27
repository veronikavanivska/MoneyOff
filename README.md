# MoneyOff - Tracker Wydatków
Front-endowa aplikacja do zarządzania wydatkami.

## Szybki start

### Wymagania
- Docker 20+

### Uruchomienie
```bash
git clone https://github.com/veronikavanivska/MoneyOff.git
cd MoneyOff
docker build -t expense-tracker .
docker run -p 5173:5173 expense-tracker
