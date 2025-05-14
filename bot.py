import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo
from telegram.ext import (
    Application,
    CommandHandler,
    CallbackQueryHandler,
    ContextTypes,
    MessageHandler,
    filters
)
import sqlite3
from datetime import datetime
import random
import json
import os

# Настройка логирования
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Конфигурация
WEBAPP_URL = "https://lorangee72.github.io/yagobrawl/"  # Замените на реальный URL вашего MiniApp


# Инициализация базы данных
def init_db():
    conn = sqlite3.connect('brawl_bot.db')
    cursor = conn.cursor()

    # Таблица игроков
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS players (
        user_id INTEGER PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        total_trophies INTEGER DEFAULT 0,
        battles_played INTEGER DEFAULT 0,
        wins INTEGER DEFAULT 0,
        registered_at TEXT,
        selected_brawler INTEGER DEFAULT 1
    )
    ''')

    # Таблица бойцов игроков
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS player_brawlers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        brawler_id INTEGER,
        trophies INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        FOREIGN KEY(user_id) REFERENCES players(user_id)
    )
    ''')

    # Таблица бойцов
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS brawlers (
        brawler_id INTEGER PRIMARY KEY,
        name TEXT,
        type TEXT,
        description TEXT,
        base_health INTEGER,
        base_damage INTEGER
    )
    ''')

    # Проверяем, есть ли уже бойцы в базе
    cursor.execute('SELECT COUNT(*) FROM brawlers')
    if cursor.fetchone()[0] == 0:
        # Добавляем стандартных бойцов
        brawlers = [
            (1, 'Дробовик', 'shotgun', 'Стреляет из дробовика треугольником', 100, 15),
            (2, 'Ганс', 'pistol', 'Стреляет из пистолетов прямо', 80, 20),
            (3, 'Боец', 'melee', 'Дерется кулаками', 120, 25)
        ]
        cursor.executemany('INSERT INTO brawlers VALUES (?, ?, ?, ?, ?, ?)', brawlers)

    conn.commit()
    conn.close()


class Database:
    @staticmethod
    def get_player(user_id):
        conn = sqlite3.connect('brawl_bot.db')
        cursor = conn.cursor()

        # Основная информация о игроке
        cursor.execute('''
        SELECT user_id, username, first_name, last_name, 
               total_trophies, battles_played, wins, registered_at, selected_brawler
        FROM players
        WHERE user_id = ?
        ''', (user_id,))

        player = cursor.fetchone()
        if not player:
            conn.close()
            return None

        # Количество бойцов игрока
        cursor.execute('SELECT COUNT(*) FROM player_brawlers WHERE user_id = ?', (user_id,))
        brawlers_count = cursor.fetchone()[0]

        # Информация о бойцах игрока
        cursor.execute('''
        SELECT pb.brawler_id, pb.trophies, pb.level, 
               b.name, b.type, b.description
        FROM player_brawlers pb
        JOIN brawlers b ON pb.brawler_id = b.brawler_id
        WHERE pb.user_id = ?
        ORDER BY pb.brawler_id
        ''', (user_id,))

        brawlers = []
        for row in cursor.fetchall():
            brawlers.append({
                'brawler_id': row[0],
                'trophies': row[1],
                'level': row[2],
                'name': row[3],
                'type': row[4],
                'description': row[5]
            })

        conn.close()

        return {
            'user_id': player[0],
            'username': player[1],
            'first_name': player[2],
            'last_name': player[3],
            'total_trophies': player[4],
            'battles_played': player[5],
            'wins': player[6],
            'registered_at': player[7],
            'selected_brawler': player[8],
            'brawlers_count': brawlers_count,
            'brawlers': brawlers
        }

    @staticmethod
    def register_player(user_id, username, first_name, last_name):
        conn = sqlite3.connect('brawl_bot.db')
        cursor = conn.cursor()

        cursor.execute('SELECT 1 FROM players WHERE user_id = ?', (user_id,))
        if cursor.fetchone():
            conn.close()
            return False

        cursor.execute('''
        INSERT INTO players 
        (user_id, username, first_name, last_name, registered_at)
        VALUES (?, ?, ?, ?, ?)
        ''', (
            user_id,
            username,
            first_name,
            last_name,
            datetime.now().isoformat()
        ))

        for brawler_id in range(1, 4):
            cursor.execute('''
            INSERT INTO player_brawlers (user_id, brawler_id)
            VALUES (?, ?)
            ''', (user_id, brawler_id))

        conn.commit()
        conn.close()
        return True

    @staticmethod
    def update_selected_brawler(user_id, brawler_id):
        conn = sqlite3.connect('brawl_bot.db')
        cursor = conn.cursor()

        cursor.execute('''
        UPDATE players
        SET selected_brawler = ?
        WHERE user_id = ?
        ''', (brawler_id, user_id))

        conn.commit()
        conn.close()

    @staticmethod
    def update_after_battle(user_id, brawler_id, place):
        conn = sqlite3.connect('brawl_bot.db')
        cursor = conn.cursor()

        trophies_change = 10 - place

        cursor.execute('''
        UPDATE players
        SET total_trophies = total_trophies + ?,
            battles_played = battles_played + 1,
            wins = wins + CASE WHEN ? = 1 THEN 1 ELSE 0 END
        WHERE user_id = ?
        ''', (max(trophies_change, 0), place, user_id))

        cursor.execute('''
        UPDATE player_brawlers
        SET trophies = trophies + ?
        WHERE user_id = ? AND brawler_id = ?
        ''', (trophies_change, user_id, brawler_id))

        conn.commit()

        cursor.execute('SELECT total_trophies FROM players WHERE user_id = ?', (user_id,))
        total_trophies = cursor.fetchone()[0]

        cursor.execute('''
        SELECT trophies FROM player_brawlers
        WHERE user_id = ? AND brawler_id = ?
        ''', (user_id, brawler_id))
        brawler_trophies = cursor.fetchone()[0]

        conn.close()

        return {
            'trophies_change': trophies_change,
            'total_trophies': total_trophies,
            'brawler_trophies': brawler_trophies
        }

    @staticmethod
    def get_top_players(limit=10):
        conn = sqlite3.connect('brawl_bot.db')
        cursor = conn.cursor()

        cursor.execute('''
        SELECT username, first_name, last_name, total_trophies, wins
        FROM players
        ORDER BY total_trophies DESC
        LIMIT ?
        ''', (limit,))

        top_players = cursor.fetchall()
        conn.close()

        return top_players


class Keyboards:
    @staticmethod
    def main_menu():
        keyboard = [
            [InlineKeyboardButton("👊 Выбрать бойца", callback_data='select_brawler')],
            [InlineKeyboardButton("⚔️ Начать бой", web_app=WebAppInfo(url=WEBAPP_URL))],
            [InlineKeyboardButton("📊 Статистика", callback_data='stats')],
            [InlineKeyboardButton("🏆 Топ игроков", callback_data='top_players')]
        ]
        return InlineKeyboardMarkup(keyboard)

    @staticmethod
    def brawlers_menu(brawlers, selected_id=None):
        keyboard = []
        for brawler in brawlers:
            emoji = '🔫' if brawler['type'] == 'pistol' else '💥' if brawler['type'] == 'shotgun' else '👊'
            text = f"{emoji} {brawler['name']} (🏆{brawler['trophies']})"
            if selected_id and brawler['brawler_id'] == selected_id:
                text = "✅ " + text
            keyboard.append([InlineKeyboardButton(text, callback_data=f'choose_{brawler["brawler_id"]}')])
        keyboard.append([InlineKeyboardButton("🔙 Назад", callback_data='back')])
        return InlineKeyboardMarkup(keyboard)

    @staticmethod
    def after_battle(place):
        keyboard = [
            [InlineKeyboardButton("⚔️ Снова в бой", web_app=WebAppInfo(url=WEBAPP_URL))],
            [InlineKeyboardButton("🔙 В меню", callback_data='back')]
        ]
        if place == 1:
            keyboard.insert(0, [InlineKeyboardButton("🎉 Поделиться победой!", callback_data='share_victory')])
        return InlineKeyboardMarkup(keyboard)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик команды /start"""
    user = update.effective_user
    player = Database.get_player(user.id)

    if not player:
        Database.register_player(user.id, user.username, user.first_name, user.last_name)
        player = Database.get_player(user.id)

        await update.message.reply_text(
            f"👋 Привет, {user.first_name}!\n\n"
            "Добро пожаловать в Brawl Telegram MiniApp!\n\n"
            "Тебе доступны 3 бойца:\n"
            "🔫 Ганс - стреляет из пистолетов прямо\n"
            "💥 Дробовик - стреляет треугольником\n"
            "👊 Боец - атакует в ближнем бою\n\n"
            "В каждом бою ты сражаешься против 9 ботов. Чем выше место - тем больше трофеев получишь!",
            reply_markup=Keyboards.main_menu()
        )
    else:
        await update.message.reply_text(
            f"Привет, {user.first_name}!\n"
            f"🏆 Рейтинг: {player['total_trophies']}\n"
            f"⚔️ Проведено боёв: {player['battles_played']}\n"
            f"🎖️ Побед: {player['wins']}\n\n"
            "Выбери действие:",
            reply_markup=Keyboards.main_menu()
        )


async def button(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик нажатий кнопок"""
    query = update.callback_query
    await query.answer()

    user_id = query.from_user.id
    data = query.data

    if data == 'select_brawler':
        await select_brawler_menu(query, user_id)
    elif data.startswith('choose_'):
        brawler_id = int(data.split('_')[1])
        Database.update_selected_brawler(user_id, brawler_id)
        player = Database.get_player(user_id)
        brawler = next(b for b in player['brawlers'] if b['brawler_id'] == brawler_id)

        await query.edit_message_text(
            f"Вы выбрали: {brawler['name']}\n\n"
            f"{brawler['description']}\n"
            f"🏆 Трофеев: {brawler['trophies']}\n"
            f"📊 Уровень: {brawler['level']}",
            reply_markup=Keyboards.brawlers_menu(player['brawlers'], brawler_id)
        )
    elif data == 'stats':
        await show_stats(query, user_id)
    elif data == 'top_players':
        await show_top_players(query)
    elif data == 'back':
        player = Database.get_player(user_id)
        await query.edit_message_text(
            f"Главное меню\n\n"
            f"🏆 Общий рейтинг: {player['total_trophies']}\n"
            f"⚔️ Проведено боёв: {player['battles_played']}\n"
            f"🎖️ Побед: {player['wins']}",
            reply_markup=Keyboards.main_menu()
        )
    elif data == 'share_victory':
        await query.answer("Поделитесь своим результатом с друзьями!")


async def select_brawler_menu(query, user_id):
    """Меню выбора бойца"""
    player = Database.get_player(user_id)

    await query.edit_message_text(
        "Выбери своего бойца:",
        reply_markup=Keyboards.brawlers_menu(player['brawlers'], player['selected_brawler'])
    )


async def show_stats(query, user_id):
    """Показать статистику игрока"""
    player = Database.get_player(user_id)

    if not player:
        await query.edit_message_text(
            "Сначала зарегистрируйтесь с помощью команды /start",
            reply_markup=Keyboards.main_menu()
        )
        return

    stats_text = (
        f"📊 Твоя статистика\n\n"
        f"🏆 Общий рейтинг: {player['total_trophies']}\n"
        f"⚔️ Проведено боёв: {player['battles_played']}\n"
        f"🎖️ Побед: {player['wins']}\n"
        f"📅 Зарегистрирован: {player['registered_at'][:10]}\n\n"
        f"Твои бойцы:\n"
    )

    for brawler in player['brawlers']:
        emoji = '🔫' if brawler['type'] == 'pistol' else '💥' if brawler['type'] == 'shotgun' else '👊'
        stats_text += (
            f"{emoji} {brawler['name']}\n"
            f"🏆 Трофеев: {brawler['trophies']} | "
            f"📊 Уровень: {brawler['level']}\n"
        )

    await query.edit_message_text(
        stats_text,
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("🔙 Назад", callback_data='back')]
        ])
    )


async def show_top_players(query):
    """Показать топ игроков"""
    top_players = Database.get_top_players(10)

    if not top_players:
        await query.edit_message_text(
            "Еще нет игроков в рейтинге",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("🔙 Назад", callback_data='back')]
            ])
        )
        return

    top_text = "🏆 Топ игроков 🏆\n\n"
    for i, (username, first_name, last_name, trophies, wins) in enumerate(top_players, 1):
        name = username or f"{first_name} {last_name}"
        top_text += f"{i}. {name} - 🏆{trophies} (🎖️{wins})\n"

    await query.edit_message_text(
        top_text,
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("🔙 Назад", callback_data='back')]
        ])
    )


async def web_app_data(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработка данных из WebApp"""
    data = json.loads(update.effective_message.web_app_data.data)
    user_id = update.effective_user.id

    if data.get('type') == 'battle_result':
        # Обработка результатов боя
        place = data['place']
        brawler_id = data['brawler_id']

        result = Database.update_after_battle(user_id, brawler_id, place)

        place_emoji = "🥇" if place == 1 else "🥈" if place == 2 else "🥉" if place == 3 else f"{place}."

        await update.effective_message.reply_text(
            f"Бой окончен!\n\n"
            f"{place_emoji} Вы заняли {place} место\n"
            f"🏆 Изменение трофеев: {'+' if result['trophies_change'] >= 0 else ''}{result['trophies_change']}\n"
            f"💎 Общие трофеи: {result['total_trophies']}",
            reply_markup=Keyboards.after_battle(place)
        )


async def error_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Обработчик ошибок"""
    logger.error(msg="Exception while handling an update:", exc_info=context.error)

    if update.callback_query:
        await update.callback_query.answer("Произошла ошибка. Попробуйте еще раз.")
    elif update.message:
        await update.message.reply_text("Произошла ошибка. Попробуйте еще раз.")


def main() -> None:
    """Запуск бота"""
    init_db()

    application = Application.builder().token("TOKEN_BOT").build()

    # Обработчики
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CallbackQueryHandler(button))
    application.add_handler(MessageHandler(filters.StatusUpdate.WEB_APP_DATA, web_app_data))
    application.add_error_handler(error_handler)

    application.run_polling()


if __name__ == "__main__":
    main()
