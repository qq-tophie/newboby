cmake_minimum_required(VERSION 3.15)

project(RobBobNetService LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(RobBobNetService
    src/main.cpp
)

target_include_directories(RobBobNetService
    PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}/../RobBobNetEngine
)

target_link_libraries(RobBobNetService
    PRIVATE
        RobBobNetEngine
)

