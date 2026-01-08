FROM rust:1.83 as builder
WORKDIR /usr/src/app
COPY . .
RUN cargo install --path .

FROM debian:bookworm-slim
COPY --from=builder /usr/local/cargo/bin/session-server /usr/local/bin/session-server
EXPOSE 3000
CMD ["session-server"]
