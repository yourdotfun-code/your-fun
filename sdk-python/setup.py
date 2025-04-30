from setuptools import setup, find_packages

setup(
    name="yourfun-sdk",
    version="0.1.0",
    description="Python SDK for the your.fun Proof-of-Human platform",
    author="your.fun",
    url="https://your.fun/",
    packages=find_packages(),
    python_requires=">=3.10",
    install_requires=[
        "httpx>=0.27.0",
        "solders>=0.21.0",
        "solana>=0.34.0",
        "pynacl>=1.5.0",
    ],
    extras_require={
        "dev": [
            "pytest>=8.0",
            "pytest-asyncio>=0.23",
        ],
    },
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
)
