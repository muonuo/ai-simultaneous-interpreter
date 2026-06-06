"""
配置管理 - 管理 API Key、模型选择等
"""

import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    """应用配置"""

    # 七牛云 API
    QINIU_API_KEY: str = os.getenv("QINIU_API_KEY", "")
    QINIU_BASE_URL: str = os.getenv("QINIU_BASE_URL", "https://api.qnaigc.com/v1")

    # 翻译模型
    TRANSLATION_MODEL: str = os.getenv("TRANSLATION_MODEL", "deepseek/deepseek-v4-flash")

    # 服务配置
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "8000"))

    @classmethod
    def validate(cls) -> None:
        """验证必要配置是否存在"""
        if not cls.QINIU_API_KEY:
            raise ValueError(
                "QINIU_API_KEY 未设置！请在 .env 文件中配置或设置环境变量。\n"
                "获取方式：登录 qiniu.com/ai → 控制台 → API Key"
            )


config = Config()
