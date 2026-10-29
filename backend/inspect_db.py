import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def main():
    engine = create_async_engine('mysql+aiomysql://root:@localhost:3306/kpu_db')
    async with engine.connect() as conn:
        res = await conn.execute(text('SHOW TABLES;'))
        tables = [row[0] for row in res.fetchall()]
        print('TABLES:', tables)
        for t in tables:
            print(f'\n=== TABLE: {t} ===')
            cols = await conn.execute(text(f'DESCRIBE `{t}`;'))
            for c in cols.fetchall():
                print(' ', c)
            fks = await conn.execute(text(f"""
                SELECT COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
                FROM information_schema.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = 'kpu_db' AND TABLE_NAME = '{t}' AND REFERENCED_TABLE_NAME IS NOT NULL;
            """))
            fks_list = fks.fetchall()
            if fks_list:
                print(' FKs:')
                for fk in fks_list:
                    print('   ', fk)
        if 'alembic_version' in tables:
            v = await conn.execute(text('SELECT * FROM alembic_version;'))
            print('\nAlembic version:', v.fetchall())

if __name__ == '__main__':
    asyncio.run(main())
