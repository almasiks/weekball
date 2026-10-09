import { defineMessages } from "../translate";

// Home (the next game), the first-visit screen and the profile.
export const home = defineMessages({
  ru: {
    noGameTitle: "Ближайшей игры пока нет",
    noGameOrganizer: "Настройте расписание или создайте разовую игру.",
    noGamePlayer: "Как только организатор назначит игру, она появится здесь.",
    scheduleLink: "Расписание и игры",
    laterGames: "Следующие игры",
    live: "LIVE",
    liveLabel: "Идёт матч: {teamA} {score} {teamB}. Открыть",
    liveBreak: "перерыв",
  },
  kk: {
    noGameTitle: "Жақын арада ойын жоқ",
    noGameOrganizer: "Кестені баптаңыз немесе бір реттік ойын құрыңыз.",
    noGamePlayer: "Ұйымдастырушы ойын белгілеген бойда ол осында пайда болады.",
    scheduleLink: "Кесте және ойындар",
    laterGames: "Келесі ойындар",
    live: "LIVE",
    liveLabel: "Матч жүріп жатыр: {teamA} {score} {teamB}. Ашу",
    liveBreak: "үзіліс",
  },
  en: {
    noGameTitle: "No upcoming game yet",
    noGameOrganizer: "Set up a schedule or create a one-off game.",
    noGamePlayer: "As soon as the organizer schedules a game, it will show up here.",
    scheduleLink: "Schedule and games",
    laterGames: "Next games",
    live: "LIVE",
    liveLabel: "Match in progress: {teamA} {score} {teamB}. Open",
    liveBreak: "break",
  },
});

export const enter = defineMessages({
  ru: {
    title: "Как тебя зовут?",
    text: "Так тебя увидят в списке игроков и составах. Пароль не нужен.",
    name: "Имя",
    placeholder: "Например, Азамат",
    submit: "Войти",
    pending: "Входим…",
  },
  kk: {
    title: "Атың кім?",
    text: "Ойыншылар тізімі мен құрамдарда осылай көрінесің. Құпиясөз қажет емес.",
    name: "Аты",
    placeholder: "Мысалы, Азамат",
    submit: "Кіру",
    pending: "Кірудеміз…",
  },
  en: {
    title: "What's your name?",
    text: "This is how you will appear in the player list and line-ups. No password needed.",
    name: "Name",
    placeholder: "For example, Azamat",
    submit: "Enter",
    pending: "Entering…",
  },
});

export const profile = defineMessages({
  ru: {
    title: "Профиль",
    name: "Имя",
    saved: "Сохранено.",
    myStats: "Моя статистика",
    roster: "Состав",
    language: "Язык",
    organizer: "Вы организатор",
    admin: "Админ",
    becomeOrganizer: "Стать организатором",
  },
  kk: {
    title: "Профиль",
    name: "Аты",
    saved: "Сақталды.",
    myStats: "Менің статистикам",
    roster: "Құрам",
    language: "Тіл",
    organizer: "Сіз ұйымдастырушысыз",
    admin: "Админ",
    becomeOrganizer: "Ұйымдастырушы болу",
  },
  en: {
    title: "Profile",
    name: "Name",
    saved: "Saved.",
    myStats: "My stats",
    roster: "Roster",
    language: "Language",
    organizer: "You are an organizer",
    admin: "Admin",
    becomeOrganizer: "Become an organizer",
  },
});

export const adminPin = defineMessages({
  ru: {
    title: "Вход для организатора",
    text: "Введите PIN-код организатора. После этого на этом устройстве откроется раздел «Админ».",
    label: "PIN-код",
    submit: "Войти",
    pending: "Проверяем…",
    wrong: "Неверный PIN-код.",
    notConfigured: "Вход для организатора не настроен: на сервере не задан ADMIN_PIN.",
  },
  kk: {
    title: "Ұйымдастырушының кіруі",
    text: "Ұйымдастырушының PIN-кодын енгізіңіз. Содан кейін осы құрылғыда «Админ» бөлімі ашылады.",
    label: "PIN-код",
    submit: "Кіру",
    pending: "Тексерудеміз…",
    wrong: "PIN-код қате.",
    notConfigured: "Ұйымдастырушының кіруі бапталмаған: серверде ADMIN_PIN берілмеген.",
  },
  en: {
    title: "Organizer sign-in",
    text: "Enter the organizer PIN. After that the Admin section opens on this device.",
    label: "PIN",
    submit: "Enter",
    pending: "Checking…",
    wrong: "Wrong PIN.",
    notConfigured: "Organizer sign-in is not set up: ADMIN_PIN is not set on the server.",
  },
});
