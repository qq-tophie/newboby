cmake_minimum_required(VERSION 3.15)

project(RobBobNetEngine LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(RobBobNetEngine SHARED
    RobBobNetEngine.cpp
)

target_include_directories(RobBobNetEngine
    PUBLIC
        ${CMAKE_CURRENT_SOURCE_DIR}
)

if (WIN32)
    target_compile_definitions(RobBobNetEngine PRIVATE ROBBOBNET_ENGINE_EXPORTS)
endif()

