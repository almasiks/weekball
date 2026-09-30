// Postgres exception codes raised by our RPCs -> user-facing Russian messages.
const ERROR_MESSAGES: Record<string, string> = {
  invalid_group_name: "Название группы должно быть от 1 до 60 символов.",
  invalid_player_name: "Имя должно быть от 1 до 40 символов.",
  invalid_invite_code:
    "Ссылка-приглашение недействительна. Попросите организатора прислать новую.",
  not_authenticated: "Не удалось войти. Обновите страницу и попробуйте ещё раз.",
  last_organizer: "В группе должен остаться хотя бы один организатор.",
  game_not_found: "Игра не найдена или доступна только участникам группы.",
  signup_closed: "Запись на эту игру закрыта.",
  game_not_active: "Игра отменена или уже завершена.",
  not_going: "Отмечать прибытие могут только записавшиеся в основной состав.",
  invalid_late_minutes: "Укажите, на сколько минут опаздываете.",
  not_organizer: "Это действие доступно только организатору.",
  invalid_status_transition: "Такое изменение статуса игры недоступно.",
  too_many_teams: "Можно создать не больше 3 команд.",
  invalid_team_name: "Название команды — от 1 до 30 символов.",
  invalid_color: "Выберите цвет из палитры.",
  color_taken: "Этот цвет уже занят другой командой.",
  team_not_found: "Команда не найдена — обновите страницу.",
  player_not_going: "Игрок больше не записан на игру.",
  invalid_assignments: "Не удалось применить расклад. Попробуйте ещё раз.",
  already_in_team: "Игрок уже в команде.",
  no_teams: "Сначала создайте команды.",
  player_not_in_team: "Игрок не в команде.",
  need_two_teams: "Для драфта нужно минимум 2 команды.",
  nobody_to_draft: "Все игроки уже распределены — выбирать некого.",
  draft_not_active: "Драфт не идёт.",
  not_your_turn: "Сейчас не ваш ход.",
  player_not_available: "Этого игрока уже выбрали.",
  invalid_level: "Уровень — от 1 до 5.",
};

export const DEFAULT_ERROR = "Что-то пошло не так. Попробуйте ещё раз.";

export function errorMessage(key: keyof typeof ERROR_MESSAGES | string): string {
  return ERROR_MESSAGES[key] ?? DEFAULT_ERROR;
}

export function toMessage(error: { message?: string } | null | undefined): string {
  const key = Object.keys(ERROR_MESSAGES).find((k) =>
    error?.message?.includes(k),
  );
  return key ? ERROR_MESSAGES[key] : DEFAULT_ERROR;
}
