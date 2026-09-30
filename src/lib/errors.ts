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
