[![Scriptable](https://img.shields.io/badge/Scriptable-iOS-blue)](https://scriptable.app/)
[![Shoper](https://img.shields.io/badge/Shoper-API-green)](https://developers.shoper.pl/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Instrukcja](https://img.shields.io/badge/Instrukcja-instalacji-orange)](docs/INSTALACJA_SCRIPTABLE.md)

# scriptable-shoper

![Podgląd projektu](assets/shoper_widgets.png)

## Widgety Shoper dla Scriptable

Widgety pokazują najważniejsze z punktu widzenia właściciela, administratora lub marketingowca dane z API Shopera bezpośrednio na ekranie iPhone’a lub iPada.

Czas odświeżania każdego widgetu można ustawić w skrypcie za pomocą zmiennej:

```javascript
const REFRESH_MINUTES = 120
```

Odświeżenie można też wymusić ręcznie z poziomu aplikacji Scriptable.

---

## Spis treści

- [Kategorie widgetów](#kategorie-widgetów)
  - [Sprzedaż](#sprzedaż)
    - [`shoper_1.js`](#shoper_1js)
    - [`shoper_big.js`](#shoper_bigjs)
- [Instalacja](#instalacja)
- [Opcje modyfikacji](#opcje-modyfikacji)
- [Bezpieczeństwo](#bezpieczeństwo)
- [Licencja](#licencja)

---

## Kategorie widgetów

### Sprzedaż

Widgety z tej kategorii pokazują dane sprzedażowe sklepu, takie jak:

- liczba zamówień dzisiaj,
- sprzedaż dzisiaj,
- średni koszyk,
- podsumowanie ostatnich 30 dni,
- wykres sprzedaży z ostatnich 30 dni — dostępny w wybranych wersjach.

| Plik | Kategoria | Rozmiary widgetu | Motywy | Opis |
|---|---|---|---|---|
| [shoper_1.js](widgety/shoper_1.js) | Sprzedaż | `medium` / `large` | `day` / `night` | Uniwersalna wersja widgetu. W trybie `large` zawiera wykres sprzedaży z ostatnich 30 dni. |
| [shoper_big.js](widgety/shoper_big.js) | Sprzedaż | `large` | `day` / `night` | Duży, czytelny widget sprzedażowy bez wersji `medium`. |

---

## Dostępne widgety sprzedażowe

### `shoper_1.js`

![Podgląd shoper_1](assets/shoper_1.png)

To główna, bardziej uniwersalna wersja widgetu.

Pozwala zmieniać rozmiar:

```javascript
const WIDGET_SIZE = "medium" // "medium" albo "large"
```

Pozwala też zmieniać motyw:

```javascript
const THEME = "night" // "night" albo "day"
```

W wersji `large` widget posiada wykres sprzedaży z ostatnich 30 dni.

---

### `shoper_big.js`

![Podgląd shoper_big](assets/shoper_big.png)

To wersja przygotowana wyłącznie pod duży widget.

Ten plik obsługuje tylko rozmiar:

```javascript
const WIDGET_SIZE = "large"
```

Można natomiast zmieniać motyw:

```javascript
const THEME = "night" // "night" albo "day"
```

`shoper_big.js` nie posiada wersji `medium`. Dane są przedstawione w dużym, czytelnym układzie.

---

## Instalacja

Pełna instrukcja instalacji widgetów w aplikacji Scriptable znajduje się tutaj:

[Instrukcja instalacji widgetów Shoper w Scriptable](docs/INSTALACJA_SCRIPTABLE.md)

Instrukcja zawiera:

- wymagania,
- przygotowanie danych API w Shoperze,
- zapisanie Client ID i Token API w Keychain Scriptable,
- konfigurację skryptu,
- tryb danych demo,
- dodanie widgetu na ekran iPhone’a,
- opis najczęstszych problemów.

---

## Opcje modyfikacji

### `shoper_1.js`

| Zmienna | Wartość |
|---|---|
| `WIDGET_SIZE` | `medium` lub `large` |
| `THEME` | `night` lub `day` |
| `USE_DEMO_DATA` | `false` lub `true` |
| `DAYS_TO_SHOW` | `30` |
| `REFRESH_MINUTES` | `120` |

### `shoper_big.js`

| Zmienna | Wartość |
|---|---|
| `WIDGET_SIZE` | tylko `large` |
| `THEME` | `night` lub `day` |
| `USE_DEMO_DATA` | `false` lub `true` |
| `DAYS_TO_SHOW` | `30` |
| `REFRESH_MINUTES` | `120` |

---

## Bezpieczeństwo

Nie zapisuj danych API bezpośrednio w pliku JS, który trafia na GitHub.

Zawsze używaj Keychain Scriptable:

```javascript
Keychain.set("shoper_client_id", "...")
Keychain.set("shoper_api_token", "...")
```

Dzięki temu repozytorium może być publiczne, a dane API pozostają tylko na Twoim urządzeniu.

---

## Licencja

Projekt jest udostępniony na licencji MIT. Szczegóły znajdziesz w pliku [LICENSE](LICENSE).
